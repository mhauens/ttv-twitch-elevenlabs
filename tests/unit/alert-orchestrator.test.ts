import { describe, expect, it } from 'vitest';

import type { PlayerAdapter } from '../../src/playback/player-adapter.js';
import { AlertOrchestrator } from '../../src/services/alert-orchestrator.js';
import {
  ControlledPlayerAdapter,
  RecordingTextToSpeechClient,
  createAlertQueueItem,
  createTempDir,
  createTestLogger,
  cleanupTempDir,
  waitFor
} from '../support/test-utils.js';

describe('AlertOrchestrator', () => {
  it('pauses queue processing until the player becomes available and then continues in order', async () => {
    const tempDir = await createTempDir();
    const tts = new RecordingTextToSpeechClient(tempDir);
    const plays: Array<{ filePath: string; correlationId: string }> = [];
    const recordedFailures: unknown[] = [];
    let playerAvailable = false;

    const player: PlayerAdapter = {
      kind: 'recovering-test',
      async ensureAvailable() {
        return playerAvailable;
      },
      async playAudio(filePath: string, correlationId: string) {
        plays.push({ filePath, correlationId });
      }
    };

    const orchestrator = new AlertOrchestrator({
      queueConfig: {
        inMemoryLimit: 2,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      overflowStore: {
        writeActiveJob: async () => undefined,
        clearActiveJob: async () => undefined,
        recordFailure: async (failure: unknown) => {
          recordedFailures.push(failure);
        },
        restoreDeferredItems: async () => []
      } as never,
      textToSpeechClient: tts,
      playerAdapter: player,
      logger: createTestLogger()
    });

    await orchestrator.enqueue(createAlertQueueItem({ sequenceNumber: 1 }));
    await orchestrator.enqueue(createAlertQueueItem({ sequenceNumber: 2 }));

    await waitFor(() => {
      expect(tts.sequenceNumbers).toEqual([]);
      expect(plays).toHaveLength(0);
      expect(recordedFailures).toHaveLength(0);
    });

    playerAvailable = true;

    await waitFor(() => {
      expect(tts.sequenceNumbers).toEqual([1, 2]);
      expect(plays).toHaveLength(2);
      expect(recordedFailures).toHaveLength(0);
    });

    await cleanupTempDir(tempDir);
  });

  it('isolates TTS failures so later alerts continue in order', async () => {
    const tempDir = await createTempDir();
    const tts = new RecordingTextToSpeechClient(tempDir);
    tts.failSequence(1, 'tts failed');
    const player = new ControlledPlayerAdapter();
    const recordedFailures: unknown[] = [];

    const orchestrator = new AlertOrchestrator({
      queueConfig: {
        inMemoryLimit: 2,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      overflowStore: {
        writeActiveJob: async () => undefined,
        clearActiveJob: async () => undefined,
        recordFailure: async (failure: unknown) => {
          recordedFailures.push(failure);
        },
        restoreDeferredItems: async () => []
      } as never,
      textToSpeechClient: tts,
      playerAdapter: player,
      logger: createTestLogger()
    });

    await orchestrator.enqueue(createAlertQueueItem({ sequenceNumber: 1 }));
    await orchestrator.enqueue(createAlertQueueItem({ sequenceNumber: 2 }));

    await waitFor(() => {
      expect(tts.sequenceNumbers).toEqual([1, 2]);
      expect(player.plays).toHaveLength(1);
      expect(recordedFailures).toHaveLength(1);
    });

    await cleanupTempDir(tempDir);
  });
});
