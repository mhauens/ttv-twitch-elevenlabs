export interface FailureSummary {
  readonly jobId: string;
  readonly requestId: string;
  readonly failureCode: string;
  readonly failureReason: string;
  readonly failedAt: string;
  readonly recoveryFailure: boolean;
}

export interface RecoveryFailureRecord extends FailureSummary {
  readonly correlationId: string;
  readonly recoveryDetectedAt: string;
  readonly previousState: 'active';
}