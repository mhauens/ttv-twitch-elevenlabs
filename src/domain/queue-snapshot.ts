import type { FailureSummary } from './recovery-failure-record.js';
import type { QueueRejectionSummary } from './queue-admission-result.js';

export interface ActiveJobSummary {
  readonly jobId: string;
  readonly alertType: string;
  readonly state: 'active';
  readonly activatedAt: string;
  readonly correlationId: string;
}

export interface QueueSnapshot {
  readonly activeJob?: ActiveJobSummary;
  readonly inMemoryDepth: number;
  readonly deferredDepth: number;
  readonly oldestPendingAgeMs: number;
  readonly recentFailures: FailureSummary[];
  readonly recentRejections: QueueRejectionSummary[];
  readonly lastUpdatedAt: string;
}

export interface HealthSnapshot {
  readonly ready: boolean;
  readonly queuePersistenceReady: boolean;
  readonly playerReady: boolean;
  readonly configurationValid: boolean;
  readonly recoveryMessage?: string;
}