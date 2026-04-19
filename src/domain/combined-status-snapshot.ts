import type { HealthSnapshot, QueueSnapshot } from './queue-snapshot.js';

export interface CombinedStatusSnapshot {
  readonly streamSequence: number;
  readonly emittedAt: string;
  readonly queue: QueueSnapshot;
  readonly health: HealthSnapshot;
}

export interface ComparableStatusState {
  readonly queue: {
    readonly activeJob?: QueueSnapshot['activeJob'];
    readonly inMemoryDepth: number;
    readonly deferredDepth: number;
    readonly oldestPendingAgeMs: number;
    readonly recentFailures: QueueSnapshot['recentFailures'];
    readonly recentRejections: QueueSnapshot['recentRejections'];
  };
  readonly health: HealthSnapshot;
}

export type StatusStreamLifecycleState = 'idle' | 'running' | 'stopping' | 'stopped';
export type StatusSubscriberTransport = 'sse' | 'ws';
export type StatusSubscriberConnectionState = 'active' | 'closing' | 'closed';

export interface StatusSubscriber {
  readonly subscriberId: string;
  readonly transport: StatusSubscriberTransport;
  readonly connectedAt: string;
  readonly keepaliveIntervalSeconds: number;
  readonly lastDeliveredSequence?: number;
  readonly connectionState: StatusSubscriberConnectionState;
}
