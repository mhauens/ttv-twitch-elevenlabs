import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { RecoveryFailureRecord } from '../domain/recovery-failure-record.js';
import type { AppLogger } from '../shared/logger.js';
import { nowIso } from '../shared/time.js';
import type { AlertOrchestrator } from './alert-orchestrator.js';
import type { OverflowStore } from './overflow-store.js';

export interface RecoveryStatus {
  readonly ready: boolean;
  readonly restoredCount: number;
  readonly highestSequenceNumber: number;
  readonly message?: string;
}

export class QueueRecoveryService {
  private readonly overflowStore: OverflowStore;
  private readonly orchestrator: AlertOrchestrator;
  private readonly logger: AppLogger;
  private status: RecoveryStatus = {
    ready: false,
    restoredCount: 0,
    highestSequenceNumber: 0
  };

  public constructor(overflowStore: OverflowStore, orchestrator: AlertOrchestrator, logger: AppLogger) {
    this.overflowStore = overflowStore;
    this.orchestrator = orchestrator;
    this.logger = logger;
  }

  public async recover(): Promise<RecoveryStatus> {
    try {
      await this.overflowStore.resetRestoredPendingItems();
      const interruptedActive = await this.overflowStore.getActiveJob();
      let highestSequenceNumber = await this.overflowStore.getMaxSequenceNumber();

      if (interruptedActive) {
        const recoveryFailure = this.createRecoveryFailure(interruptedActive);
        await this.overflowStore.recordRecoveryFailure(recoveryFailure);
        await this.overflowStore.clearActiveJob();
        highestSequenceNumber = Math.max(highestSequenceNumber, interruptedActive.sequenceNumber);
        this.logger.warn({ jobId: interruptedActive.jobId }, 'Recovered interrupted active alert as recovery-failed.');
      }

      const restoredCount = await this.orchestrator.refillFromOverflow();
      const deferredRemaining = await this.overflowStore.getDeferredDepth();
      const messageParts: string[] = [];

      if (interruptedActive) {
        messageParts.push('Marked the interrupted active alert as recovery-failed.');
      }
      if (restoredCount > 0) {
        messageParts.push(
          deferredRemaining > 0
            ? `Recovered ${restoredCount} deferred alert(s) into memory; ${deferredRemaining} remain deferred.`
            : `Recovered ${restoredCount} deferred alert(s) from durable overflow.`
        );
      }

      this.status = {
        ready: true,
        restoredCount,
        highestSequenceNumber,
        message: messageParts.length > 0 ? messageParts.join(' ') : undefined
      };

      return this.status;
    } catch (error) {
      this.logger.error({ error }, 'Queue recovery failed during startup.');
      this.status = {
        ready: false,
        restoredCount: 0,
        highestSequenceNumber: 0,
        message: 'Queue recovery failed during startup; intake remains unavailable.'
      };

      return this.status;
    }
  }

  public getStatus(): RecoveryStatus {
    return this.status;
  }

  private createRecoveryFailure(activeItem: AlertQueueItem): RecoveryFailureRecord {
    return {
      jobId: activeItem.jobId,
      requestId: activeItem.requestId,
      correlationId: activeItem.correlationId,
      failureCode: 'INTERRUPTED_ACTIVE_ALERT',
      failureReason: 'The service restarted while this alert was active, so it was marked failed and not replayed automatically.',
      failedAt: nowIso(),
      recoveryFailure: true,
      recoveryDetectedAt: nowIso(),
      previousState: 'active'
    };
  }
}
