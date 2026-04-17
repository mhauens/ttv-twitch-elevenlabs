import path from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApplication, type ApplicationContext } from '../../src/app/server.js';
import { OverflowStore } from '../../src/services/overflow-store.js';
import {
  ControlledPlayerAdapter,
  RecordingTextToSpeechClient,
  cleanupTempDir,
  createAlertQueueItem,
  createTempDir,
  createTestEnv,
  createTestLogger,
  waitFor
} from '../support/test-utils.js';

describe('queue recovery integration', () => {
  let tempDir: string | undefined;
  let application: ApplicationContext | undefined;
  let player: ControlledPlayerAdapter | undefined;

  afterEach(async () => {
    player?.releaseAll();
    if (application) {
      await application.stop();
      application = undefined;
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    player = undefined;
  });

  it('marks interrupted active work as recovery-failed and resumes deferred backlog', async () => {
    tempDir = await createTempDir();
    const dbPath = path.join(tempDir, 'alerts.sqlite');
    const seedStore = new OverflowStore(dbPath, createTestLogger());
    await seedStore.initialize();
    await seedStore.writeActiveJob(
      createAlertQueueItem({
        sequenceNumber: 1,
        state: 'active',
        activatedAt: '2026-04-17T00:00:00.000Z'
      })
    );
    await seedStore.persistDeferred(
      createAlertQueueItem({
        sequenceNumber: 2,
        state: 'deferred-overflow',
        storageTier: 'deferred-overflow',
        admissionOutcome: 'deferred-to-disk'
      })
    );
    await seedStore.dispose();

    player = new ControlledPlayerAdapter();
    const gate = player.blockNextPlayback();
    const tts = new RecordingTextToSpeechClient(path.join(tempDir, 'audio'));

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: dbPath,
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio'),
        QUEUE_MEMORY_LIMIT: 1,
        QUEUE_DEFERRED_LIMIT: 5
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: tts
    });

    const client = request(application.app);

    await waitFor(() => {
      expect(player?.plays).toHaveLength(1);
    });

    const queue = await client.get('/api/v1/queue');
    const health = await client.get('/api/v1/health');

    expect(queue.body.data.activeJob).toBeDefined();
    expect(queue.body.data.recentFailures[0].recoveryFailure).toBe(true);
    expect(health.body.data.recoveryMessage).toContain('recovery-failed');

    gate.release();

    await waitFor(() => {
      expect(tts.sequenceNumbers).toEqual([2]);
    });
  });
});