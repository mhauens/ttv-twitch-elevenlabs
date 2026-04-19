import { isDeepStrictEqual } from 'node:util';

import type {
  ComparableStatusState,
  CombinedStatusSnapshot,
  StatusStreamLifecycleState,
  StatusSubscriber,
  StatusSubscriberConnectionState,
  StatusSubscriberTransport
} from '../domain/combined-status-snapshot.js';
import type { QueueSnapshot } from '../domain/queue-snapshot.js';
import { createRequestId } from '../shared/ids.js';
import type { AppLogger } from '../shared/logger.js';
import { nowIso } from '../shared/time.js';
import type { QueueStatusService } from './queue-status-service.js';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_SSE_KEEPALIVE_INTERVAL_MS = 15_000;
const DEFAULT_WS_KEEPALIVE_INTERVAL_MS = 30_000;
const WEBSOCKET_OPEN_STATE = 1;
const NORMAL_CLOSE_CODE = 1000;
const SERVICE_SHUTDOWN_CODE = 1001;
const SERVICE_SHUTDOWN_REASON = 'Service shutting down';
const INTERNAL_ERROR_CLOSE_CODE = 1011;
const NORMAL_CLOSE_REASON = 'Status stream subscription closed';
const INTERNAL_ERROR_CLOSE_REASON = 'Status stream connection failed';

export class StatusStreamUnavailableError extends Error {
  public constructor(message = 'Status stream is unavailable.') {
    super(message);
    this.name = 'StatusStreamUnavailableError';
  }
}

export interface StatusStreamStartOptions {
  readonly applicationOwned?: boolean;
}

export interface StatusStreamServiceOptions {
  readonly queueStatusService: QueueStatusService;
  readonly logger: AppLogger;
  readonly pollIntervalMs?: number;
  readonly sseKeepaliveIntervalMs?: number;
  readonly wsKeepaliveIntervalMs?: number;
}

export interface SseSubscriptionHandlers {
  readonly onSnapshot: (snapshot: CombinedStatusSnapshot) => void;
  readonly onKeepalive: () => void;
  readonly onClose?: () => void;
}

export interface StatusStreamSubscription {
  readonly subscriberId: string;
  unsubscribe(): void;
}

export interface StatusWebSocketPeer {
  readonly readyState: number;
  send(data: string): void;
  ping(): void;
  close(code?: number, data?: string): void;
  terminate?(): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'message', listener: (...args: unknown[]) => void): void;
  on(event: 'pong', listener: () => void): void;
}

interface InternalSubscriber extends StatusSubscriber {
  lastDeliveredSequence?: number;
  connectionState: StatusSubscriberConnectionState;
  readonly keepaliveIntervalMs: number;
  lastActivityAt: number;
  awaitingPong: boolean;
  readonly keepaliveTimer: NodeJS.Timeout;
  readonly deliverSnapshot: (snapshot: CombinedStatusSnapshot) => void;
  readonly deliverKeepalive: () => void;
  readonly closeTransport: (reason: string) => void;
}

function buildComparableState(queue: QueueSnapshot, health: CombinedStatusSnapshot['health']): ComparableStatusState {
  return {
    queue: {
      activeJob: queue.activeJob,
      inMemoryDepth: queue.inMemoryDepth,
      deferredDepth: queue.deferredDepth,
      oldestPendingAgeMs: queue.oldestPendingAgeMs,
      recentFailures: queue.recentFailures,
      recentRejections: queue.recentRejections
    },
    health
  };
}

export class StatusStreamService {
  private readonly queueStatusService: QueueStatusService;
  private readonly logger: AppLogger;
  private readonly pollIntervalMs: number;
  private readonly sseKeepaliveIntervalMs: number;
  private readonly wsKeepaliveIntervalMs: number;
  private readonly subscribers = new Map<string, InternalSubscriber>();

  private lifecycleState: StatusStreamLifecycleState = 'idle';
  private latestSnapshot: CombinedStatusSnapshot | undefined;
  private lastComparableState: ComparableStatusState | undefined;
  private nextSequenceNumber = 1;
  private pollTimer: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<CombinedStatusSnapshot | undefined> | undefined;
  private lastRefreshError: Error | undefined;
  private applicationOwned = false;

  public constructor(options: StatusStreamServiceOptions) {
    this.queueStatusService = options.queueStatusService;
    this.logger = options.logger;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.sseKeepaliveIntervalMs = options.sseKeepaliveIntervalMs ?? DEFAULT_SSE_KEEPALIVE_INTERVAL_MS;
    this.wsKeepaliveIntervalMs = options.wsKeepaliveIntervalMs ?? DEFAULT_WS_KEEPALIVE_INTERVAL_MS;
  }

  public async start(options: StatusStreamStartOptions = {}): Promise<void> {
    if (this.lifecycleState === 'running') {
      if (options.applicationOwned) {
        this.applicationOwned = true;
      }
      return;
    }

    if (this.lifecycleState === 'stopping' || this.lifecycleState === 'stopped') {
      throw new StatusStreamUnavailableError('Status stream is shutting down.');
    }

    this.applicationOwned = options.applicationOwned ?? false;

    this.lifecycleState = 'running';
  }

  public async stop(): Promise<void> {
    if (this.lifecycleState === 'stopped') {
      return;
    }

    this.lifecycleState = 'stopping';
    this.applicationOwned = false;
    this.stopPolling();

    if (this.refreshInFlight) {
      await this.refreshInFlight;
    }

    for (const subscriberId of [...this.subscribers.keys()]) {
      this.removeSubscriber(subscriberId, 'service-stopping', true);
    }

    this.lifecycleState = 'stopped';
  }

  public async subscribeSse(handlers: SseSubscriptionHandlers): Promise<StatusStreamSubscription> {
    await this.start();
    this.ensurePolling();

    const subscriber = this.registerSubscriber({
      transport: 'sse',
      keepaliveIntervalMs: this.sseKeepaliveIntervalMs,
      deliverSnapshot: handlers.onSnapshot,
      deliverKeepalive: handlers.onKeepalive,
      closeTransport: handlers.onClose ?? (() => undefined)
    });

    const snapshot = this.ensureInitialSnapshotAvailable(
      subscriber.subscriberId,
      await this.refreshSnapshot({ force: true }),
      false
    );
    if (subscriber.lastDeliveredSequence !== snapshot.streamSequence) {
      this.deliverSnapshot(subscriber.subscriberId, snapshot);
    }

    return {
      subscriberId: subscriber.subscriberId,
      unsubscribe: () => {
        this.removeSubscriber(subscriber.subscriberId, 'client-disconnected', false);
      }
    };
  }

  public async subscribeWebSocket(socket: StatusWebSocketPeer): Promise<StatusStreamSubscription> {
    await this.start();
    this.ensurePolling();

    const subscriber = this.registerSubscriber({
      transport: 'ws',
      keepaliveIntervalMs: this.wsKeepaliveIntervalMs,
      deliverSnapshot: (snapshot) => {
        if (socket.readyState !== WEBSOCKET_OPEN_STATE) {
          throw new Error('WebSocket is not open.');
        }
        socket.send(JSON.stringify(snapshot));
      },
      deliverKeepalive: () => {
        if (socket.readyState !== WEBSOCKET_OPEN_STATE) {
          throw new Error('WebSocket is not open.');
        }
        socket.ping();
      },
      closeTransport: (reason) => {
        if (reason === 'missed-pong' || reason === 'keepalive-failed' || reason === 'snapshot-delivery-failed') {
          socket.terminate?.();
          return;
        }

        if (socket.readyState === WEBSOCKET_OPEN_STATE) {
          if (reason === 'service-stopping') {
            socket.close(SERVICE_SHUTDOWN_CODE, SERVICE_SHUTDOWN_REASON);
            return;
          }

          if (reason === 'client-disconnected') {
            socket.close(NORMAL_CLOSE_CODE, NORMAL_CLOSE_REASON);
            return;
          }

          socket.close(INTERNAL_ERROR_CLOSE_CODE, INTERNAL_ERROR_CLOSE_REASON);
        }
      }
    });

    socket.on('message', () => {
      this.logger.debug({ subscriberId: subscriber.subscriberId }, 'Ignoring client-originated WebSocket message.');
    });
    socket.on('pong', () => {
      const activeSubscriber = this.subscribers.get(subscriber.subscriberId);
      if (!activeSubscriber) {
        return;
      }
      activeSubscriber.awaitingPong = false;
      activeSubscriber.lastActivityAt = Date.now();
    });
    socket.on('error', (error) => {
      this.logger.warn({ error, subscriberId: subscriber.subscriberId }, 'Closing WebSocket subscriber after socket error.');
      this.removeSubscriber(subscriber.subscriberId, 'socket-error', false);
    });
    socket.on('close', () => {
      this.removeSubscriber(subscriber.subscriberId, 'socket-closed', false);
    });

    const snapshot = this.ensureInitialSnapshotAvailable(
      subscriber.subscriberId,
      await this.refreshSnapshot({ force: true }),
      false
    );
    if (subscriber.lastDeliveredSequence !== snapshot.streamSequence) {
      this.deliverSnapshot(subscriber.subscriberId, snapshot);
    }

    return {
      subscriberId: subscriber.subscriberId,
      unsubscribe: () => {
        this.removeSubscriber(subscriber.subscriberId, 'client-disconnected', true);
      }
    };
  }

  private registerSubscriber(options: {
    readonly transport: StatusSubscriberTransport;
    readonly keepaliveIntervalMs: number;
    readonly deliverSnapshot: (snapshot: CombinedStatusSnapshot) => void;
    readonly deliverKeepalive: () => void;
    readonly closeTransport: (reason: string) => void;
  }): InternalSubscriber {
    const subscriberId = createRequestId();
    const subscriber: InternalSubscriber = {
      subscriberId,
      transport: options.transport,
      connectedAt: nowIso(),
      keepaliveIntervalMs: options.keepaliveIntervalMs,
      keepaliveIntervalSeconds: Math.max(1, Math.ceil(options.keepaliveIntervalMs / 1000)),
      connectionState: 'active',
      lastActivityAt: Date.now(),
      awaitingPong: false,
      keepaliveTimer: setInterval(() => {
        this.handleKeepaliveTick(subscriberId);
      }, options.keepaliveIntervalMs),
      deliverSnapshot: options.deliverSnapshot,
      deliverKeepalive: options.deliverKeepalive,
      closeTransport: options.closeTransport
    };

    subscriber.keepaliveTimer.unref?.();
    this.subscribers.set(subscriberId, subscriber);
    this.logger.info(
      { subscriberId, transport: subscriber.transport, connectedAt: subscriber.connectedAt },
      'Status stream subscriber connected.'
    );

    return subscriber;
  }

  private handleKeepaliveTick(subscriberId: string): void {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber || subscriber.connectionState !== 'active') {
      return;
    }

    if (Date.now() - subscriber.lastActivityAt < subscriber.keepaliveIntervalMs) {
      return;
    }

    if (subscriber.transport === 'ws' && subscriber.awaitingPong) {
      this.logger.warn({ subscriberId }, 'Closing stale WebSocket subscriber after missed pong.');
      this.removeSubscriber(subscriberId, 'missed-pong', true);
      return;
    }

    try {
      subscriber.deliverKeepalive();
      subscriber.lastActivityAt = Date.now();
      if (subscriber.transport === 'ws') {
        subscriber.awaitingPong = true;
      }
    } catch (error) {
      this.logger.warn({ error, subscriberId }, 'Closing subscriber after keepalive failure.');
      this.removeSubscriber(subscriberId, 'keepalive-failed', true);
    }
  }

  private deliverSnapshot(subscriberId: string, snapshot: CombinedStatusSnapshot): void {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber || subscriber.connectionState !== 'active') {
      return;
    }

    try {
      subscriber.deliverSnapshot(snapshot);
      subscriber.lastDeliveredSequence = snapshot.streamSequence;
      subscriber.lastActivityAt = Date.now();
      subscriber.awaitingPong = false;
    } catch (error) {
      this.logger.warn({ error, subscriberId }, 'Closing subscriber after snapshot delivery failure.');
      this.removeSubscriber(subscriberId, 'snapshot-delivery-failed', true);
    }
  }

  private broadcastSnapshot(snapshot: CombinedStatusSnapshot): void {
    for (const subscriberId of this.subscribers.keys()) {
      this.deliverSnapshot(subscriberId, snapshot);
    }
  }

  private removeSubscriber(subscriberId: string, reason: string, closeTransport: boolean): void {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) {
      return;
    }

    this.subscribers.delete(subscriberId);
    clearInterval(subscriber.keepaliveTimer);
    subscriber.connectionState = 'closing';

    if (closeTransport) {
      try {
        subscriber.closeTransport(reason);
      } catch (error) {
        this.logger.warn({ error, subscriberId }, 'Ignoring subscriber transport close failure.');
      }
    }

    subscriber.connectionState = 'closed';
    this.deactivateIfUnused();
    this.logger.info(
      { subscriberId, transport: subscriber.transport, reason, lastDeliveredSequence: subscriber.lastDeliveredSequence },
      'Status stream subscriber disconnected.'
    );
  }

  private ensureInitialSnapshotAvailable(
    subscriberId: string,
    snapshot: CombinedStatusSnapshot | undefined,
    closeTransport: boolean
  ): CombinedStatusSnapshot {
    if (snapshot) {
      return snapshot;
    }

    this.removeSubscriber(subscriberId, 'initial-snapshot-unavailable', closeTransport);
    throw new StatusStreamUnavailableError(this.lastRefreshError?.message ?? 'Status stream initial snapshot is unavailable.');
  }

  private async refreshSnapshot(options: { force?: boolean } = {}): Promise<CombinedStatusSnapshot | undefined> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refreshSnapshotUnsafe(options).finally(() => {
      this.refreshInFlight = undefined;
    });

    return this.refreshInFlight;
  }

  private async refreshSnapshotUnsafe(options: { force?: boolean }): Promise<CombinedStatusSnapshot | undefined> {
    if (this.lifecycleState !== 'running' && this.lifecycleState !== 'stopping') {
      return this.latestSnapshot;
    }

    try {
      const queue = await this.queueStatusService.getQueueSnapshot();
      const health = await this.queueStatusService.getHealthSnapshot();
      const comparableState = buildComparableState(queue, health);

      this.lastRefreshError = undefined;
      if (this.lastComparableState && isDeepStrictEqual(this.lastComparableState, comparableState)) {
        if (!options.force) {
          return this.latestSnapshot;
        }

        const freshSnapshot = this.createSnapshot(this.latestSnapshot?.streamSequence ?? this.nextSequenceNumber, queue, health);
        this.latestSnapshot = freshSnapshot;
        return freshSnapshot;
      }

      this.lastComparableState = comparableState;
      this.latestSnapshot = this.createSnapshot(this.nextSequenceNumber, queue, health);
      this.nextSequenceNumber += 1;
      this.broadcastSnapshot(this.latestSnapshot);

      return this.latestSnapshot;
    } catch (error) {
      const refreshError = error instanceof Error ? error : new Error('Unknown snapshot refresh error.');
      this.lastRefreshError = refreshError;
      this.latestSnapshot = undefined;
      this.lastComparableState = undefined;
      this.logger.error({ error: refreshError }, 'Status stream snapshot refresh failed.');
      this.closeSubscribersForRefreshFailure();
      return undefined;
    }
  }

  private createSnapshot(
    streamSequence: number,
    queue: QueueSnapshot,
    health: CombinedStatusSnapshot['health']
  ): CombinedStatusSnapshot {
    return {
      streamSequence,
      emittedAt: nowIso(),
      queue,
      health
    };
  }

  private closeSubscribersForRefreshFailure(): void {
    for (const subscriberId of [...this.subscribers.keys()]) {
      this.removeSubscriber(subscriberId, 'snapshot-refresh-failed', true);
    }
  }

  private deactivateIfUnused(): void {
    if (this.subscribers.size > 0 || this.lifecycleState !== 'running') {
      return;
    }

    this.stopPolling();
    if (!this.applicationOwned) {
      this.lifecycleState = 'idle';
    }
  }

  private ensurePolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.refreshSnapshot();
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  private stopPolling(): void {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }
}
