import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createApplication, type ApplicationContext } from '../../src/app/server.js';
import {
  ControlledPlayerAdapter,
  RecordingTextToSpeechClient,
  cleanupTempDir,
  createTempDir,
  createTestEnv,
  createTestLogger,
  getAvailablePort,
  openSseStream,
  openTestWebSocket,
  waitForWebSocketClose,
  waitForWebSocketMessage
} from '../support/test-utils.js';
import type { ParsedSseFrame } from '../support/test-utils.js';

function parseSnapshot<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

async function waitForSseSnapshot(
  nextFrame: (timeoutMs?: number) => Promise<ParsedSseFrame>,
  timeoutMs = 1_000
): Promise<ParsedSseFrame> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frame = await nextFrame(timeoutMs);
    if (frame.data) {
      return frame;
    }
  }

  throw new Error(`Timed out waiting for an SSE snapshot frame after ${timeoutMs} ms.`);
}

async function expectNoWebSocketMessage(socket: WebSocket, timeoutMs = 250): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    timeout.unref?.();

    const handleMessage = () => {
      cleanup();
      reject(new Error(`Unexpected WebSocket message arrived within ${timeoutMs} ms.`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('message', handleMessage);
    };

    socket.addEventListener('message', handleMessage, { once: true });
  });
}

describe('status stream integration', () => {
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

  it('delivers SSE snapshots immediately, remains available while degraded, emits changes, and sends keepalives', async () => {
    tempDir = await createTempDir('status-stream-sse-');
    player = new ControlledPlayerAdapter();
    player.available = false;
    const port = await getAvailablePort();

    application = await createApplication({
      env: createTestEnv({
        PORT: port,
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: new RecordingTextToSpeechClient(path.join(tempDir, 'audio')),
      statusStreamOptions: {
        pollIntervalMs: 50,
        sseKeepaliveIntervalMs: 150,
        wsKeepaliveIntervalMs: 150
      }
    });
    await application.start();

    const stream = await openSseStream(`http://127.0.0.1:${port}/api/v1/status/stream`);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.response.headers.get('cache-control')).toBe('no-cache');
    expect(stream.response.headers.get('connection')).toBe('keep-alive');

    const initialFrame = await stream.nextFrame();
    const degradedSnapshot = parseSnapshot<{ health: { ready: boolean; playerReady: boolean } }>(initialFrame.data ?? '{}');
    expect(initialFrame.event).toBe('snapshot');
    expect(initialFrame.id).toBe('1');
    expect(degradedSnapshot.health.ready).toBe(false);
    expect(degradedSnapshot.health.playerReady).toBe(false);

    player.available = true;
    const readyFrame = await stream.nextFrame();
    const readySnapshot = parseSnapshot<{ health: { ready: boolean; playerReady: boolean } }>(readyFrame.data ?? '{}');
    expect(readySnapshot.health.ready).toBe(true);

    const gate = player.blockNextPlayback();
    const admission = await fetch(`http://127.0.0.1:${port}/api/v1/alerts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: 'local',
        alertType: 'follow',
        payload: { userName: 'alpha', message: 'status stream sse' }
      })
    });
    expect(admission.status).toBe(202);

    const activeFrame = await waitForSseSnapshot(stream.nextFrame);
    const activeSnapshot = parseSnapshot<{ queue: { activeJob?: { state: string } } }>(activeFrame.data ?? '{}');
    expect(activeSnapshot.queue.activeJob?.state).toBe('active');

    gate.release();
    const idleFrame = await waitForSseSnapshot(stream.nextFrame);
    const idleSnapshot = parseSnapshot<{ queue: { activeJob?: unknown; inMemoryDepth: number } }>(idleFrame.data ?? '{}');
    expect(idleSnapshot.queue.activeJob).toBeUndefined();
    expect(idleSnapshot.queue.inMemoryDepth).toBe(0);

    const keepaliveFrame = await stream.nextFrame(1_000);
    expect(keepaliveFrame.comment).toBe('keepalive');

    await stream.close();
  });

  it('delivers matching snapshots over WebSocket, ignores client messages, and emits only real changes', async () => {
    tempDir = await createTempDir('status-stream-ws-');
    player = new ControlledPlayerAdapter();
    player.available = false;
    const port = await getAvailablePort();

    application = await createApplication({
      env: createTestEnv({
        PORT: port,
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: new RecordingTextToSpeechClient(path.join(tempDir, 'audio')),
      statusStreamOptions: {
        pollIntervalMs: 50,
        sseKeepaliveIntervalMs: 150,
        wsKeepaliveIntervalMs: 150
      }
    });
    await application.start();

    const socket = await openTestWebSocket(`ws://127.0.0.1:${port}/api/v1/status/ws`);
    const initialSnapshot = parseSnapshot<{ health: { ready: boolean; playerReady: boolean } }>(
      await waitForWebSocketMessage(socket)
    );
    expect(initialSnapshot.health.ready).toBe(false);

    player.available = true;
    const readySnapshot = parseSnapshot<{ health: { ready: boolean } }>(await waitForWebSocketMessage(socket));
    expect(readySnapshot.health.ready).toBe(true);

    socket.send('hello from client');
    await expectNoWebSocketMessage(socket);

    const gate = player.blockNextPlayback();
    const admission = await fetch(`http://127.0.0.1:${port}/api/v1/alerts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: 'local',
        alertType: 'raid',
        payload: { userName: 'bravo', message: 'status stream ws' }
      })
    });
    expect(admission.status).toBe(202);

    const activeSnapshot = parseSnapshot<{ queue: { activeJob?: { state: string } } }>(await waitForWebSocketMessage(socket));
    expect(activeSnapshot.queue.activeJob?.state).toBe('active');

    gate.release();
    const idleSnapshot = parseSnapshot<{ queue: { activeJob?: unknown; inMemoryDepth: number } }>(
      await waitForWebSocketMessage(socket)
    );
    expect(idleSnapshot.queue.activeJob).toBeUndefined();
    expect(idleSnapshot.queue.inMemoryDepth).toBe(0);

    socket.close();
  });

  it('keeps pull endpoints unchanged and closes open stream clients cleanly during shutdown', async () => {
    tempDir = await createTempDir('status-stream-shutdown-');
    player = new ControlledPlayerAdapter();
    player.available = false;
    const port = await getAvailablePort();

    application = await createApplication({
      env: createTestEnv({
        PORT: port,
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: new RecordingTextToSpeechClient(path.join(tempDir, 'audio')),
      statusStreamOptions: {
        pollIntervalMs: 50,
        sseKeepaliveIntervalMs: 150,
        wsKeepaliveIntervalMs: 150
      }
    });
    await application.start();

    const queueResponse = await fetch(`http://127.0.0.1:${port}/api/v1/queue`);
    const queueBody = await queueResponse.json();
    expect(queueResponse.status).toBe(200);
    expect(queueBody.status).toBe('ok');
    expect(queueBody.data).toMatchObject({
      inMemoryDepth: expect.any(Number),
      deferredDepth: expect.any(Number),
      oldestPendingAgeMs: expect.any(Number),
      recentFailures: expect.any(Array),
      recentRejections: expect.any(Array),
      lastUpdatedAt: expect.any(String)
    });

    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    const healthBody = await healthResponse.json();
    expect(healthResponse.status).toBe(503);
    expect(healthBody.status).toBe('unavailable');
    expect(healthBody.data).toMatchObject({
      ready: false,
      queuePersistenceReady: true,
      playerReady: false,
      configurationValid: true
    });

    const sseStream = await openSseStream(`http://127.0.0.1:${port}/api/v1/status/stream`);
    await sseStream.nextFrame();
    const socket = await openTestWebSocket(`ws://127.0.0.1:${port}/api/v1/status/ws`);
    await waitForWebSocketMessage(socket);

    const stopPromise = application.stop();

    await expect(sseStream.nextFrame(1_000)).rejects.toThrow();
    await waitForWebSocketClose(socket);

    await stopPromise;
    application = undefined;
  });

  it('returns a shutdown error when the status stream service is no longer accepting subscribers', async () => {
    tempDir = await createTempDir('status-stream-stop-guard-');
    player = new ControlledPlayerAdapter();
    const port = await getAvailablePort();

    application = await createApplication({
      env: createTestEnv({
        PORT: port,
        QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
        AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
      }),
      logger: createTestLogger(),
      playerAdapter: player,
      textToSpeechClient: new RecordingTextToSpeechClient(path.join(tempDir, 'audio')),
      statusStreamOptions: {
        pollIntervalMs: 50,
        sseKeepaliveIntervalMs: 150,
        wsKeepaliveIntervalMs: 150
      }
    });
    await application.start();

    await application.services.statusStreamService.stop();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/status/stream`, {
      headers: {
        Accept: 'text/event-stream'
      }
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.error.code).toBe('STATUS_STREAM_UNAVAILABLE');
  });
});
