import { unlink } from 'node:fs/promises';

import type { QueueConfig } from '../config/queue-config.js';
import type { ActiveJobSummary } from '../domain/queue-snapshot.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { FailureSummary } from '../domain/recovery-failure-record.js';
import type { TextToSpeechClient } from '../integrations/text-to-speech-client.js';
import type { PlayerAdapter } from '../playback/player-adapter.js';
import type { AppLogger } from '../shared/logger.js';
import { ageMs, nowIso } from '../shared/time.js';
import type { OverflowStore } from './overflow-store.js';

export interface AlertOrchestratorOptions {
  readonly queueConfig: QueueConfig;
  readonly overflowStore: OverflowStore;
  readonly textToSpeechClient: TextToSpeechClient;
  readonly playerAdapter: PlayerAdapter;
  readonly logger: AppLogger;
}

export class AlertOrchestrator {
  private static readonly initialPlayerUnavailableRetryDelayMs = 250;
  private static readonly maxPlayerUnavailableRetryDelayMs = 2_000;

  private readonly queueConfig: QueueConfig;
  private readonly overflowStore: OverflowStore;
  private readonly textToSpeechClient: TextToSpeechClient;
  private readonly playerAdapter: PlayerAdapter;
  private readonly logger: AppLogger;

  private pending: AlertQueueItem[] = [];
  private activeItem: AlertQueueItem | null = null;
  private drainingPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private pausedForPlayerUnavailability = false;
  private playerUnavailableRetryDelayMs = AlertOrchestrator.initialPlayerUnavailableRetryDelayMs;

  public constructor(options: AlertOrchestratorOptions) {
    this.queueConfig = options.queueConfig;
    this.overflowStore = options.overflowStore;
    this.textToSpeechClient = options.textToSpeechClient;
    this.playerAdapter = options.playerAdapter;
    this.logger = options.logger;
  }

  public async enqueue(item: AlertQueueItem): Promise<void> {
    if (this.shuttingDown) {
      throw new Error('The orchestrator is shutting down and cannot accept new in-memory work.');
    }

    this.pending.push(item);
    this.pending.sort((left, right) => left.sequenceNumber - right.sequenceNumber);
    this.scheduleDrain();
  }

  public async enqueueRestored(items: AlertQueueItem[]): Promise<void> {
    this.pending.push(...items);
    this.pending.sort((left, right) => left.sequenceNumber - right.sequenceNumber);
    this.scheduleDrain();
  }

  public async refillFromOverflow(): Promise<number> {
    if (this.shuttingDown) {
      return 0;
    }

    const availableSlots = Math.max(this.queueConfig.inMemoryLimit - this.getInMemoryWorkCount(), 0);
    if (availableSlots === 0) {
      return 0;
    }

    const restoredItems = await this.overflowStore.restoreDeferredItems(availableSlots);
    if (restoredItems.length === 0) {
      return 0;
    }

    this.pending.push(...restoredItems);
    this.pending.sort((left, right) => left.sequenceNumber - right.sequenceNumber);
    this.logger.info(
      {
        restoredCount: restoredItems.length,
        pendingDepth: this.pending.length
      },
      'Promoted deferred overflow items into the in-memory queue.'
    );
    this.scheduleDrain();

    return restoredItems.length;
  }

  public getInMemoryWorkCount(): number {
    return this.pending.length + (this.activeItem ? 1 : 0);
  }

  public getPendingDepth(): number {
    return this.pending.length;
  }

  public getActiveSummary(): ActiveJobSummary | undefined {
    if (!this.activeItem || !this.activeItem.activatedAt) {
      return undefined;
    }

    return {
      jobId: this.activeItem.jobId,
      alertType: this.activeItem.alertType,
      state: 'active',
      activatedAt: this.activeItem.activatedAt,
      correlationId: this.activeItem.correlationId
    };
  }

  public getOldestPendingAgeMs(): number {
    const oldest = this.pending[0];
    return oldest ? ageMs(oldest.enqueuedAt) : 0;
  }

  public async prepareForShutdown(): Promise<void> {
    this.shuttingDown = true;

    if (this.drainingPromise) {
      await this.drainingPromise;
    }

    if (this.queueConfig.shutdownPolicy === 'preserve-pending') {
      const pending = [...this.pending];
      this.pending = [];
      for (const item of pending) {
        await this.overflowStore.persistDeferred({
          ...item,
          state: 'deferred-overflow',
          storageTier: 'deferred-overflow',
          admissionOutcome: 'deferred-to-disk'
        });
      }
      return;
    }

    this.pending = [];
  }

  private scheduleDrain(): void {
    if (this.drainingPromise || this.pending.length === 0 || this.shuttingDown) {
      return;
    }

    this.drainingPromise = this.drain().finally(() => {
      this.drainingPromise = null;
      if (this.pending.length > 0 && !this.shuttingDown) {
        this.scheduleDrain();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0 && !this.shuttingDown) {
      const nextItem = this.pending.shift();
      if (!nextItem) {
        return;
      }

      if (!(await this.ensurePlayerAvailableBeforeProcessing(nextItem))) {
        return;
      }

      const activeItem: AlertQueueItem = {
        ...nextItem,
        state: 'active',
        storageTier: 'memory',
        activatedAt: nowIso()
      };
      this.activeItem = activeItem;
      await this.overflowStore.writeActiveJob(activeItem);

      let generatedFilePath: string | undefined;
      try {
        const synthesizedAudio = await this.textToSpeechClient.synthesize(activeItem);
        generatedFilePath = synthesizedAudio.filePath;
        await this.playerAdapter.playAudio(synthesizedAudio.filePath, activeItem.correlationId);
        this.logger.info({ jobId: activeItem.jobId, sequenceNumber: activeItem.sequenceNumber }, 'Completed alert playback.');
      } catch (error) {
        const failureSummary: FailureSummary = {
          jobId: activeItem.jobId,
          requestId: activeItem.requestId,
          failureCode: 'ALERT_PROCESSING_FAILED',
          failureReason: error instanceof Error ? error.message : 'Unknown processing failure.',
          failedAt: nowIso(),
          recoveryFailure: false
        };
        await this.overflowStore.recordFailure(failureSummary, activeItem.correlationId);
        this.logger.error(
          {
            error,
            jobId: activeItem.jobId,
            sequenceNumber: activeItem.sequenceNumber
          },
          'Alert processing failed; continuing with the next queued alert.'
        );
      } finally {
        await this.overflowStore.clearActiveJob();
        this.activeItem = null;
        if (generatedFilePath) {
          await unlink(generatedFilePath).catch(() => undefined);
        }
        await this.refillFromOverflow();
      }
    }
  }

  private async ensurePlayerAvailableBeforeProcessing(nextItem: AlertQueueItem): Promise<boolean> {
    if (await this.playerAdapter.ensureAvailable()) {
      if (this.pausedForPlayerUnavailability) {
        this.pausedForPlayerUnavailability = false;
        this.playerUnavailableRetryDelayMs = AlertOrchestrator.initialPlayerUnavailableRetryDelayMs;
        this.logger.info('Player became available again; resumed queued alert processing before TTS synthesis.');
      }
      return true;
    }

    this.pending.unshift(nextItem);
    if (!this.pausedForPlayerUnavailability) {
      this.pausedForPlayerUnavailability = true;
      this.logger.warn(
        {
          jobId: nextItem.jobId,
          sequenceNumber: nextItem.sequenceNumber,
          pendingDepth: this.pending.length,
          retryDelayMs: this.playerUnavailableRetryDelayMs
        },
        'Paused queued alert processing because the configured player is unavailable before TTS synthesis.'
      );
    }
    const retryDelayMs = this.playerUnavailableRetryDelayMs;
    this.playerUnavailableRetryDelayMs = Math.min(
      this.playerUnavailableRetryDelayMs * 2,
      AlertOrchestrator.maxPlayerUnavailableRetryDelayMs
    );
    await delay(retryDelayMs);

    return false;
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
