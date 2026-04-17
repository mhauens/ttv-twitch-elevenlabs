import path from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApplication, type ApplicationContext } from '../../src/app/server.js';
import {
  ControlledPlayerAdapter,
  RecordingTextToSpeechClient,
  cleanupTempDir,
  createTempDir,
  createTestEnv,
  createTestLogger,
  waitFor
} from '../support/test-utils.js';

describe('queue burst integration', () => {
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

  it('defers overflow to disk and later drains that backlog in sequence order', async () => {
    tempDir = await createTempDir();
    player = new ControlledPlayerAdapter();
    const firstGate = player.blockNextPlayback();
    const tts = new RecordingTextToSpeechClient(path.join(tempDir, 'audio'));

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio'),
        QUEUE_MEMORY_LIMIT: 1,
        QUEUE_DEFERRED_LIMIT: 5
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: tts
    });

    const client = request(application.app);
    const first = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'alpha', message: 'one' }
    });

    await waitFor(() => {
      expect(player?.plays).toHaveLength(1);
    });

    const second = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'bravo', message: 'two' }
    });
    const third = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'charlie', message: 'three' }
    });

    expect(first.status).toBe(202);
    expect(second.body.data.outcome).toBe('deferred-to-disk');
    expect(third.body.data.outcome).toBe('deferred-to-disk');

    const queuedWhileBlocked = await client.get('/api/v1/queue');
    expect(queuedWhileBlocked.body.data.deferredDepth).toBe(2);

    firstGate.release();

    await waitFor(() => {
      expect(tts.sequenceNumbers).toEqual([1, 2, 3]);
      expect(player?.plays).toHaveLength(3);
    });

    const drained = await client.get('/api/v1/queue');
    expect(drained.body.data.inMemoryDepth).toBe(0);
    expect(drained.body.data.deferredDepth).toBe(0);
  });
});