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

describe('queue status integration', () => {
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

  it('surfaces deferred backlog, rejections, duplicate handling, and readiness', async () => {
    tempDir = await createTempDir();
    player = new ControlledPlayerAdapter();
    const firstGate = player.blockNextPlayback();
    const tts = new RecordingTextToSpeechClient(path.join(tempDir, 'audio'));

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio'),
        QUEUE_MEMORY_LIMIT: 1,
        QUEUE_DEFERRED_LIMIT: 1
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: tts
    });

    const client = request(application.app);
    await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      dedupeKey: 'dup-1',
      payload: { userName: 'alpha', message: 'one' }
    });

    await waitFor(() => {
      expect(player?.plays).toHaveLength(1);
    });

    await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'bravo', message: 'two' }
    });
    const rejected = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'charlie', message: 'three' }
    });
    const duplicate = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      dedupeKey: 'dup-1',
      payload: { userName: 'alpha', message: 'duplicate' }
    });

    const queue = await client.get('/api/v1/queue');
    const health = await client.get('/api/v1/health');

    expect(rejected.status).toBe(429);
    expect(duplicate.status).toBe(409);
    expect(queue.body.data.activeJob).toBeDefined();
    expect(queue.body.data.deferredDepth).toBe(1);
    expect(queue.body.data.recentRejections[0].reasonCode).toBe('QUEUE_BACKPRESSURE_LIMIT');
    expect(health.status).toBe(200);
    expect(health.body.data.ready).toBe(true);

    firstGate.release();
  });

  it('blocks intake when player readiness is unavailable', async () => {
    tempDir = await createTempDir();
    player = new ControlledPlayerAdapter();
    player.available = false;

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: new RecordingTextToSpeechClient(path.join(tempDir, 'audio'))
    });

    const client = request(application.app);
    const health = await client.get('/api/v1/health');
    const admission = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'alpha', message: 'one' }
    });

    expect(health.status).toBe(503);
    expect(health.body.data.ready).toBe(false);
    expect(health.body.data.playerReady).toBe(false);
    expect(admission.status).toBe(503);
    expect(admission.body.error.code).toBe('PLAYER_UNAVAILABLE');
  });

  it('pauses queued work until player availability returns and resumes before TTS', async () => {
    tempDir = await createTempDir();
    const plays: Array<{ filePath: string; correlationId: string }> = [];
    let allowAdmissionOnce = true;
    let playerAvailable = false;
    const tts = new RecordingTextToSpeechClient(path.join(tempDir, 'audio'));

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio'),
        QUEUE_MEMORY_LIMIT: 2,
        QUEUE_DEFERRED_LIMIT: 5
      }),
      logger: createTestLogger(),
      playerAdapter: {
        kind: 'recovering-test',
        async ensureAvailable() {
          if (allowAdmissionOnce) {
            allowAdmissionOnce = false;
            return true;
          }
          return playerAvailable;
        },
        async playAudio(filePath: string, correlationId: string) {
          plays.push({ filePath, correlationId });
        }
      },
      textToSpeechClient: tts
    });

    const client = request(application.app);
    const first = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'alpha', message: 'one' }
    });
    expect(first.status).toBe(202);

    await waitFor(async () => {
      expect(tts.sequenceNumbers).toEqual([]);
      expect(plays).toHaveLength(0);
      const queue = await client.get('/api/v1/queue');
      expect(queue.body.data.activeJob).toBeUndefined();
      expect(queue.body.data.inMemoryDepth).toBe(1);
      expect(queue.body.data.recentFailures).toEqual([]);
      const health = await client.get('/api/v1/health');
      expect(health.status).toBe(503);
      expect(health.body.data.playerReady).toBe(false);
    });

    playerAvailable = true;

    await waitFor(async () => {
      expect(tts.sequenceNumbers).toEqual([1]);
      expect(plays).toHaveLength(1);
      const queue = await client.get('/api/v1/queue');
      expect(queue.body.data.inMemoryDepth).toBe(0);
    });
  });

  it('stops alert intake before shutdown persistence begins', async () => {
    tempDir = await createTempDir();
    player = new ControlledPlayerAdapter();
    const gate = player.blockNextPlayback();
    const tts = new RecordingTextToSpeechClient(path.join(tempDir, 'audio'));

    application = await createApplication({
      env: createTestEnv({
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio'),
        QUEUE_MEMORY_LIMIT: 2,
        QUEUE_DEFERRED_LIMIT: 5
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: tts
    });

    const client = request(application.app);
    await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'alpha', message: 'one' }
    });

    await waitFor(() => {
      expect(player?.plays).toHaveLength(1);
    });

    const stopPromise = application.stop();
    const duringShutdown = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'bravo', message: 'two' }
    });

    expect(duringShutdown.status).toBe(503);
    expect(duringShutdown.body.error.code).toBe('QUEUE_SHUTTING_DOWN');

    gate.release();
    await stopPromise;
    application = undefined;
  });
});
