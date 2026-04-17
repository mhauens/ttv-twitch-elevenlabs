export type QueueAdmissionOutcome =
  | 'accepted'
  | 'deferred-to-disk'
  | 'duplicate-handled'
  | 'rejected'
  | 'rate-limited';

export interface QueueAdmissionResult {
  readonly requestId: string;
  readonly outcome: QueueAdmissionOutcome;
  readonly reasonCode: string;
  readonly message: string;
  readonly jobId?: string;
  readonly sequenceNumber?: number;
}

export interface QueueRejectionSummary {
  readonly requestId: string;
  readonly reasonCode: string;
  readonly message: string;
  readonly rejectedAt: string;
}