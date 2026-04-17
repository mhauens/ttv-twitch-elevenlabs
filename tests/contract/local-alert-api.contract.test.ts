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

describe('local alert API contract', () => {
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

  it('returns documented admission, queue-status, and health envelopes', async () => {
    tempDir = await createTempDir();
    player = new ControlledPlayerAdapter();
    const gate = player.blockNextPlayback();
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
    const accepted = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      dedupeKey: 'dup-1',
      payload: { userName: 'alpha', message: 'hello' }
    });

    await waitFor(() => {
      expect(player?.plays).toHaveLength(1);
    });

    const duplicate = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      dedupeKey: 'dup-1',
      payload: { userName: 'alpha', message: 'hello again' }
    });
    const invalid = await client.post('/api/v1/alerts').send({
      source: 'local',
      payload: {}
    });
    const queue = await client.get('/api/v1/queue');
    const health = await client.get('/api/v1/health');

    expect(accepted.status).toBe(202);
    expect(accepted.body.status).toBe('accepted');
    expect(accepted.body.data).toMatchObject({
      requestId: expect.any(String),
      jobId: expect.any(String),
      sequenceNumber: expect.any(Number),
      outcome: 'accepted',
      reasonCode: expect.any(String),
      message: expect.any(String)
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.status).toBe('accepted');
    expect(duplicate.body.data.outcome).toBe('duplicate-handled');

    expect(invalid.status).toBe(400);
    expect(invalid.body.status).toBe('error');
    expect(invalid.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      requestId: expect.any(String)
    });

    expect(queue.status).toBe(200);
    expect(queue.body.status).toBe('ok');
    expect(queue.body.data).toMatchObject({
      inMemoryDepth: expect.any(Number),
      deferredDepth: expect.any(Number),
      oldestPendingAgeMs: expect.any(Number),
      recentFailures: expect.any(Array),
      recentRejections: expect.any(Array),
      lastUpdatedAt: expect.any(String)
    });

    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.data).toMatchObject({
      ready: expect.any(Boolean),
      queuePersistenceReady: expect.any(Boolean),
      playerReady: expect.any(Boolean),
      configurationValid: expect.any(Boolean)
    });

    gate.release();
  });

  it('returns the documented 503 error envelope when player availability blocks intake', async () => {
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
    const unavailable = await client.post('/api/v1/alerts').send({
      source: 'local',
      alertType: 'cheer',
      payload: { userName: 'alpha', message: 'hello' }
    });

    expect(unavailable.status).toBe(503);
    expect(unavailable.body.status).toBe('error');
    expect(unavailable.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      requestId: expect.any(String)
    });
  });
});
