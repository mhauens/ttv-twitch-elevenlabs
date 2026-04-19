import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CombinedStatusSnapshot } from '../../src/domain/combined-status-snapshot.js';
import type { QueueSnapshot, HealthSnapshot } from '../../src/domain/queue-snapshot.js';
import {
  StatusStreamService,
  StatusStreamUnavailableError,
  type SseSubscriptionHandlers,
  type StatusWebSocketPeer
} from '../../src/services/status-stream-service.js';
import { createTestLogger } from '../support/test-utils.js';

function createQueueSnapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    inMemoryDepth: 0,
    deferredDepth: 0,
    oldestPendingAgeMs: 0,
    recentFailures: [],
    recentRejections: [],
    lastUpdatedAt: '2026-04-19T12:00:00.000Z',
    ...overrides
  };
}

function createHealthSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    ready: true,
    queuePersistenceReady: true,
    playerReady: true,
    configurationValid: true,
    ...overrides
  };
}

class MutableQueueStatusService {
  public queueSnapshot = createQueueSnapshot();
  public healthSnapshot = createHealthSnapshot();
  public queueSnapshotError: Error | undefined;
  public healthSnapshotError: Error | undefined;
  public queueReads = 0;
  public healthReads = 0;

  public async getQueueSnapshot(): Promise<QueueSnapshot> {
    this.queueReads += 1;
    if (this.queueSnapshotError) {
      throw this.queueSnapshotError;
    }
    return structuredClone(this.queueSnapshot);
  }

  public async getHealthSnapshot(): Promise<HealthSnapshot> {
    this.healthReads += 1;
    if (this.healthSnapshotError) {
      throw this.healthSnapshotError;
    }
    return structuredClone(this.healthSnapshot);
  }
}

class FakeWebSocket implements StatusWebSocketPeer {
  public readyState = 1;
  public readonly sent: string[] = [];
  public pingCount = 0;
  public closeCount = 0;
  public terminateCount = 0;
  public lastCloseCode: number | undefined;
  public lastCloseReason: string | undefined;
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  public send(data: string): void {
    this.sent.push(data);
  }

  public ping(): void {
    this.pingCount += 1;
  }

  public close(code?: number, reason?: string): void {
    this.closeCount += 1;
    this.lastCloseCode = code;
    this.lastCloseReason = reason;
    this.readyState = 3;
    this.emit('close');
  }

  public terminate(): void {
    this.terminateCount += 1;
    this.readyState = 3;
    this.emit('close');
  }

  public on(event: 'close', listener: () => void): void;
  public on(event: 'error', listener: (error: Error) => void): void;
  public on(event: 'message', listener: (...args: unknown[]) => void): void;
  public on(event: 'pong', listener: () => void): void;
  public on(
    event: 'close' | 'error' | 'message' | 'pong',
    listener: (() => void) | ((error: Error) => void) | ((...args: unknown[]) => void)
  ): void {
    const listeners = this.listeners.get(event) ?? [];
    if (event === 'error') {
      listeners.push((error) => {
        (listener as (error: Error) => void)(error as Error);
      });
    } else {
      listeners.push((...args) => {
        (listener as (...args: unknown[]) => void)(...args);
      });
    }
    this.listeners.set(event, listeners);
  }

  public emit(event: 'close' | 'error' | 'message' | 'pong', ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

describe('StatusStreamService', () => {
  let queueStatusService: MutableQueueStatusService;
  let service: StatusStreamService;

  beforeEach(() => {
    vi.useFakeTimers();
    queueStatusService = new MutableQueueStatusService();
    service = new StatusStreamService({
      queueStatusService: queueStatusService as never,
      logger: createTestLogger(),
      pollIntervalMs: 100,
      sseKeepaliveIntervalMs: 1_000,
      wsKeepaliveIntervalMs: 1_000
    });
  });

  afterEach(async () => {
    await service.stop();
    vi.useRealTimers();
  });

  async function subscribeSse(handlers: Partial<SseSubscriptionHandlers> = {}) {
    const fullSnapshots: CombinedStatusSnapshot[] = [];
    const snapshots: QueueSnapshot[] = [];
    const sequences: number[] = [];
    const keepalives: number[] = [];
    const closes: number[] = [];

    const subscription = await service.subscribeSse({
      onSnapshot: (snapshot) => {
        fullSnapshots.push(snapshot);
        snapshots.push(snapshot.queue);
        sequences.push(snapshot.streamSequence);
      },
      onKeepalive: () => {
        keepalives.push(Date.now());
      },
      onClose: () => {
        closes.push(Date.now());
      },
      ...handlers
    });

    return { subscription, fullSnapshots, snapshots, sequences, keepalives, closes };
  }

  it('increments sequence only for semantic changes and ignores queue timestamp churn', async () => {
    const subscriber = await subscribeSse();

    expect(subscriber.sequences).toEqual([1]);

    queueStatusService.queueSnapshot = createQueueSnapshot({
      lastUpdatedAt: '2026-04-19T12:00:01.000Z'
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(subscriber.sequences).toEqual([1]);

    queueStatusService.queueSnapshot = createQueueSnapshot({
      inMemoryDepth: 1,
      lastUpdatedAt: '2026-04-19T12:00:02.000Z'
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(subscriber.sequences).toEqual([1, 2]);
  });

  it('replays the latest snapshot to new subscribers and cleans up disconnected subscribers', async () => {
    const first = await subscribeSse();

    queueStatusService.healthSnapshot = createHealthSnapshot({ ready: false, playerReady: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(first.sequences).toEqual([1, 2]);

    const second = await subscribeSse();
    expect(second.sequences).toEqual([2]);

    first.subscription.unsubscribe();

    queueStatusService.queueSnapshot = createQueueSnapshot({
      inMemoryDepth: 2,
      lastUpdatedAt: '2026-04-19T12:00:03.000Z'
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(first.sequences).toEqual([1, 2]);
    expect(second.sequences).toEqual([2, 3]);
  });

  it('refreshes before the initial replay for a new subscriber even when a cached snapshot exists', async () => {
    const first = await subscribeSse();
    expect(first.sequences).toEqual([1]);

    queueStatusService.queueSnapshot = createQueueSnapshot({
      inMemoryDepth: 3,
      lastUpdatedAt: '2026-04-19T12:00:03.000Z'
    });

    const second = await subscribeSse();

    expect(first.sequences).toEqual([1, 2]);
    expect(second.sequences).toEqual([2]);
    expect(queueStatusService.queueReads).toBeGreaterThanOrEqual(2);
  });

  it('replays a freshly read snapshot to new subscribers without creating a new sequence when the semantic state is unchanged', async () => {
    vi.setSystemTime(new Date('2026-04-19T12:00:00.000Z'));
    queueStatusService.queueSnapshot = createQueueSnapshot({
      lastUpdatedAt: '2026-04-19T12:00:00.000Z'
    });

    const first = await subscribeSse();
    expect(first.sequences).toEqual([1]);
    expect(first.snapshots[0]?.lastUpdatedAt).toBe('2026-04-19T12:00:00.000Z');

    vi.setSystemTime(new Date('2026-04-19T12:00:05.000Z'));
    queueStatusService.queueSnapshot = createQueueSnapshot({
      lastUpdatedAt: '2026-04-19T12:00:05.000Z'
    });

    const second = await subscribeSse();

    expect(first.sequences).toEqual([1]);
    expect(second.sequences).toEqual([1]);
    expect(second.snapshots[0]?.lastUpdatedAt).toBe('2026-04-19T12:00:05.000Z');
    expect(second.fullSnapshots[0]?.emittedAt).toBe('2026-04-19T12:00:05.000Z');
  });

  it('emits keepalives during idle periods and closes SSE subscribers during stop', async () => {
    service = new StatusStreamService({
      queueStatusService: queueStatusService as never,
      logger: createTestLogger(),
      pollIntervalMs: 10_000,
      sseKeepaliveIntervalMs: 1_000,
      wsKeepaliveIntervalMs: 1_000
    });

    const subscriber = await subscribeSse();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(subscriber.keepalives).toHaveLength(1);

    await service.stop();
    expect(subscriber.closes).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(subscriber.keepalives).toHaveLength(1);
  });

  it('uses exact keepalive milliseconds so recent snapshot activity suppresses premature SSE keepalives', async () => {
    service = new StatusStreamService({
      queueStatusService: queueStatusService as never,
      logger: createTestLogger(),
      pollIntervalMs: 50,
      sseKeepaliveIntervalMs: 150,
      wsKeepaliveIntervalMs: 1_000
    });

    const subscriber = await subscribeSse();
    expect(subscriber.sequences).toEqual([1]);

    await vi.advanceTimersByTimeAsync(100);
    queueStatusService.queueSnapshot = createQueueSnapshot({
      inMemoryDepth: 1,
      lastUpdatedAt: '2026-04-19T12:00:01.000Z'
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(subscriber.sequences).toEqual([1, 2]);
    expect(subscriber.keepalives).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(150);
    expect(subscriber.keepalives).toHaveLength(1);
  });

  it('does not poll until the first subscriber arrives and returns to idle after the last subscriber disconnects', async () => {
    expect(queueStatusService.queueReads).toBe(0);
    expect(queueStatusService.healthReads).toBe(0);

    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(0);
    expect(queueStatusService.healthReads).toBe(0);

    const first = await subscribeSse();
    const readsAfterSubscribe = queueStatusService.queueReads;
    expect(readsAfterSubscribe).toBeGreaterThan(0);

    first.subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(readsAfterSubscribe);
    expect(queueStatusService.healthReads).toBe(readsAfterSubscribe);
  });

  it('keeps the application-owned lifecycle active without polling while no subscribers are connected', async () => {
    await service.start({ applicationOwned: true });

    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(0);
    expect(queueStatusService.healthReads).toBe(0);

    const firstSubscriber = await subscribeSse();
    const readsAfterFirstSubscribe = queueStatusService.queueReads;
    expect(readsAfterFirstSubscribe).toBeGreaterThan(0);

    firstSubscriber.subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(readsAfterFirstSubscribe);
    expect(queueStatusService.healthReads).toBe(readsAfterFirstSubscribe);

    const secondSubscriber = await subscribeSse();
    expect(queueStatusService.queueReads).toBeGreaterThan(readsAfterFirstSubscribe);
    secondSubscriber.subscription.unsubscribe();
  });

  it('keeps healthy WebSocket subscribers alive and closes dead ones after a missed pong', async () => {
    service = new StatusStreamService({
      queueStatusService: queueStatusService as never,
      logger: createTestLogger(),
      pollIntervalMs: 10_000,
      sseKeepaliveIntervalMs: 1_000,
      wsKeepaliveIntervalMs: 1_000
    });

    const healthySocket = new FakeWebSocket();
    const staleSocket = new FakeWebSocket();

    await service.subscribeWebSocket(healthySocket);
    await service.subscribeWebSocket(staleSocket);

    expect(healthySocket.sent).toHaveLength(1);
    expect(staleSocket.sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(healthySocket.pingCount).toBe(1);
    expect(staleSocket.pingCount).toBe(1);

    healthySocket.emit('pong');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(healthySocket.closeCount).toBe(0);
    expect(staleSocket.closeCount).toBe(0);
    expect(staleSocket.terminateCount).toBe(1);
  });

  it('reserves the shutdown close code for service stop and uses a normal close for explicit unsubscribe', async () => {
    service = new StatusStreamService({
      queueStatusService: queueStatusService as never,
      logger: createTestLogger(),
      pollIntervalMs: 10_000,
      sseKeepaliveIntervalMs: 1_000,
      wsKeepaliveIntervalMs: 1_000
    });

    const shutdownSocket = new FakeWebSocket();
    const unsubscribeSocket = new FakeWebSocket();

    await service.subscribeWebSocket(shutdownSocket);
    const subscription = await service.subscribeWebSocket(unsubscribeSocket);

    subscription.unsubscribe();
    expect(unsubscribeSocket.closeCount).toBe(1);
    expect(unsubscribeSocket.lastCloseCode).toBe(1000);
    expect(unsubscribeSocket.lastCloseReason).toBe('Status stream subscription closed');

    await service.stop();
    expect(shutdownSocket.closeCount).toBe(1);
    expect(shutdownSocket.lastCloseCode).toBe(1001);
    expect(shutdownSocket.lastCloseReason).toBe('Service shutting down');
  });

  it('rejects new subscriptions after stop has begun', async () => {
    await service.stop();

    await expect(
      service.subscribeSse({
        onSnapshot: () => undefined,
        onKeepalive: () => undefined
      })
    ).rejects.toBeInstanceOf(StatusStreamUnavailableError);
  });

  it('rejects SSE subscriptions when the initial snapshot cannot be loaded and no cached snapshot exists', async () => {
    queueStatusService.queueSnapshotError = new Error('Queue snapshot unavailable.');

    await expect(
      service.subscribeSse({
        onSnapshot: () => undefined,
        onKeepalive: () => undefined
      })
    ).rejects.toBeInstanceOf(StatusStreamUnavailableError);

    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(1);
    expect(queueStatusService.healthReads).toBe(0);
  });

  it('closes existing subscribers instead of serving stale snapshots after a refresh failure', async () => {
    const subscriber = await subscribeSse();
    expect(subscriber.sequences).toEqual([1]);

    queueStatusService.queueSnapshotError = new Error('Queue snapshot unavailable.');
    await vi.advanceTimersByTimeAsync(100);

    expect(subscriber.closes).toHaveLength(1);

    queueStatusService.queueSnapshotError = undefined;
    queueStatusService.queueSnapshot = createQueueSnapshot({
      inMemoryDepth: 2,
      lastUpdatedAt: '2026-04-19T12:00:03.000Z'
    });

    const recoveredSubscriber = await subscribeSse();
    expect(recoveredSubscriber.sequences).toEqual([2]);
    expect(recoveredSubscriber.snapshots[0]?.inMemoryDepth).toBe(2);
  });

  it('rejects WebSocket subscriptions when the initial snapshot cannot be loaded and no cached snapshot exists', async () => {
    queueStatusService.queueSnapshotError = new Error('Queue snapshot unavailable.');
    const socket = new FakeWebSocket();

    await expect(service.subscribeWebSocket(socket)).rejects.toBeInstanceOf(StatusStreamUnavailableError);

    expect(socket.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(queueStatusService.queueReads).toBe(1);
    expect(queueStatusService.healthReads).toBe(0);
  });
});
