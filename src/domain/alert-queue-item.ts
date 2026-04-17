import type { AlertRequest } from './alert-request.js';

export type AlertQueueState =
  | 'received'
  | 'pending-memory'
  | 'deferred-overflow'
  | 'restored-pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'recovery-failed';

export type StorageTier = 'memory' | 'deferred-overflow';

export interface AlertQueueItem extends AlertRequest {
  readonly jobId: string;
  readonly state: AlertQueueState;
  readonly storageTier: StorageTier;
  readonly sequenceNumber: number;
  readonly admissionOutcome: 'accepted' | 'deferred-to-disk';
  readonly enqueuedAt: string;
  readonly activatedAt?: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
}