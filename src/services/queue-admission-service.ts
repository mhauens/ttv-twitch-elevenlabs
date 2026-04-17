import type { QueueConfig } from '../config/queue-config.js';
import type { AlertRequest } from '../domain/alert-request.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { QueueAdmissionResult, QueueRejectionSummary } from '../domain/queue-admission-result.js';
import type { PlayerAdapter } from '../playback/player-adapter.js';
import { ApiError } from '../shared/errors.js';
import { createJobId } from '../shared/ids.js';
import type { AppLogger } from '../shared/logger.js';
import { nowIso } from '../shared/time.js';
import type { AlertOrchestrator } from './alert-orchestrator.js';
import type { OverflowStore } from './overflow-store.js';
import type { QueueRecoveryService } from './queue-recovery-service.js';

export type AdmissionDecision =
  | {
      readonly kind: 'accepted';
      readonly statusCode: 202 | 409;
      readonly result: QueueAdmissionResult;
    }
  | {
      readonly kind: 'rejected';
      readonly error: ApiError;
    };

export interface QueueAdmissionServiceOptions {
  readonly queueConfig: QueueConfig;
  readonly orchestrator: AlertOrchestrator;
  readonly overflowStore: OverflowStore;
  readonly queueRecoveryService: QueueRecoveryService;
  readonly playerAdapter: PlayerAdapter;
  readonly logger: AppLogger;
  readonly initialSequenceNumber: number;
}

export class QueueAdmissionService {
  private readonly queueConfig: QueueConfig;
  private readonly orchestrator: AlertOrchestrator;
  private readonly overflowStore: OverflowStore;
  private readonly queueRecoveryService: QueueRecoveryService;
  private readonly playerAdapter: PlayerAdapter;
  private readonly logger: AppLogger;
  private nextSequenceNumber: number;
  private readonly dedupeResults = new Map<string, QueueAdmissionResult>();
  private readonly recentRejections: QueueRejectionSummary[] = [];

  public constructor(options: QueueAdmissionServiceOptions) {
    this.queueConfig = options.queueConfig;
    this.orchestrator = options.orchestrator;
    this.overflowStore = options.overflowStore;
    this.queueRecoveryService = options.queueRecoveryService;
    this.playerAdapter = options.playerAdapter;
    this.logger = options.logger;
    this.nextSequenceNumber = options.initialSequenceNumber;
  }

  public async admit(request: AlertRequest): Promise<AdmissionDecision> {
    if (!this.overflowStore.isReady() || !this.queueRecoveryService.getStatus().ready) {
      return {
        kind: 'rejected',
        error: new ApiError(503, 'QUEUE_PERSISTENCE_UNAVAILABLE', 'Queue persistence is not ready.', request.requestId)
      };
    }

    if (!(await this.playerAdapter.ensureAvailable())) {
      return {
        kind: 'rejected',
        error: new ApiError(503, 'PLAYER_UNAVAILABLE', 'Alert intake is not ready because the configured player is unavailable.', request.requestId)
      };
    }

    if (request.dedupeKey && this.dedupeResults.has(request.dedupeKey)) {
      const previous = this.dedupeResults.get(request.dedupeKey)!;
      this.logger.info({ dedupeKey: request.dedupeKey, requestId: request.requestId, jobId: previous.jobId }, 'Handled duplicate alert request.');
      return {
        kind: 'accepted',
        statusCode: 409,
        result: {
          ...previous,
          requestId: request.requestId,
          outcome: 'duplicate-handled',
          reasonCode: 'DUPLICATE_ALERT',
          message: 'Duplicate alert request was handled without creating new side effects.'
        }
      };
    }

    const sequenceNumber = ++this.nextSequenceNumber;
    await this.overflowStore.saveLastSequenceNumber(sequenceNumber);

    const baseItem = this.createQueueItem(request, sequenceNumber);
    const deferredDepth = await this.overflowStore.getDeferredDepth();
    if (deferredDepth === 0 && this.orchestrator.getInMemoryWorkCount() < this.queueConfig.inMemoryLimit) {
      const acceptedItem: AlertQueueItem = {
        ...baseItem,
        state: 'pending-memory',
        storageTier: 'memory',
        admissionOutcome: 'accepted'
      };

      await this.orchestrator.enqueue(acceptedItem);
      const result: QueueAdmissionResult = {
        requestId: request.requestId,
        jobId: acceptedItem.jobId,
        sequenceNumber,
        outcome: 'accepted',
        reasonCode: 'ACCEPTED',
        message: 'Alert accepted into the in-memory queue.'
      };
      this.rememberDedupe(request.dedupeKey, result);
      this.logger.info(
        {
          requestId: request.requestId,
          jobId: acceptedItem.jobId,
          sequenceNumber,
          inMemoryDepth: this.orchestrator.getPendingDepth(),
          deferredDepth
        },
        'Accepted alert into memory queue.'
      );

      return {
        kind: 'accepted',
        statusCode: 202,
        result
      };
    }

    if (deferredDepth < this.queueConfig.deferredLimit) {
      const deferredItem: AlertQueueItem = {
        ...baseItem,
        state: 'deferred-overflow',
        storageTier: 'deferred-overflow',
        admissionOutcome: 'deferred-to-disk'
      };
      await this.overflowStore.persistDeferred(deferredItem);
      const result: QueueAdmissionResult = {
        requestId: request.requestId,
        jobId: deferredItem.jobId,
        sequenceNumber,
        outcome: 'deferred-to-disk',
        reasonCode: 'DEFERRED_OVERFLOW',
        message: 'Alert deferred to durable overflow storage.'
      };
      this.rememberDedupe(request.dedupeKey, result);
      this.logger.warn(
        {
          requestId: request.requestId,
          jobId: deferredItem.jobId,
          sequenceNumber,
          inMemoryDepth: this.orchestrator.getPendingDepth(),
          deferredDepth: deferredDepth + 1
        },
        'Deferred alert to overflow storage.'
      );

      return {
        kind: 'accepted',
        statusCode: 202,
        result
      };
    }

    this.recordRejection({
      requestId: request.requestId,
      reasonCode: 'QUEUE_BACKPRESSURE_LIMIT',
      message: 'Queue rejected the alert because deferred overflow capacity is exhausted.',
      rejectedAt: nowIso()
    });
    this.logger.warn(
      {
        requestId: request.requestId,
        inMemoryDepth: this.orchestrator.getPendingDepth(),
        deferredDepth
      },
      'Rejected alert because deferred overflow capacity is exhausted.'
    );

    return {
      kind: 'rejected',
      error: new ApiError(
        429,
        'QUEUE_BACKPRESSURE_LIMIT',
        'Queue rejected the alert because deferred overflow capacity is exhausted.',
        request.requestId
      )
    };
  }

  public getRecentRejections(): QueueRejectionSummary[] {
    return [...this.recentRejections];
  }

  private createQueueItem(request: AlertRequest, sequenceNumber: number): Omit<AlertQueueItem, 'state' | 'storageTier' | 'admissionOutcome'> {
    return {
      ...request,
      jobId: createJobId(),
      sequenceNumber,
      enqueuedAt: nowIso()
    };
  }

  private rememberDedupe(dedupeKey: string | undefined, result: QueueAdmissionResult): void {
    if (dedupeKey) {
      this.dedupeResults.set(dedupeKey, result);
    }
  }

  private recordRejection(summary: QueueRejectionSummary): void {
    this.recentRejections.unshift(summary);
    this.recentRejections.splice(this.queueConfig.recentRejectionLimit);
  }
}
