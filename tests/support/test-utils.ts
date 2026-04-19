import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AppEnv } from '../../src/config/env.js';
import type { AlertQueueItem } from '../../src/domain/alert-queue-item.js';
import type { AlertRequest } from '../../src/domain/alert-request.js';
import type { TextToSpeechClient, SynthesizedAudio } from '../../src/integrations/text-to-speech-client.js';
import type { PlayerAdapter } from '../../src/playback/player-adapter.js';
import { createLogger } from '../../src/shared/logger.js';
import { nowIso } from '../../src/shared/time.js';

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    QUEUE_MEMORY_LIMIT: 2,
    QUEUE_DEFERRED_LIMIT: 10,
    QUEUE_RECENT_FAILURE_LIMIT: 20,
    QUEUE_RECENT_REJECTION_LIMIT: 20,
    QUEUE_DB_PATH: path.join(os.tmpdir(), 'alert-queue-test.sqlite'),
    AUDIO_OUTPUT_DIR: path.join(os.tmpdir(), 'alert-queue-audio'),
    PLAYER_KIND: 'vlc',
    PLAYER_COMMAND: 'vlc',
    PLAYER_TIMEOUT_MS: 30_000,
    TTS_MODE: 'stub',
    ELEVENLABS_API_KEY: '',
    ELEVENLABS_VOICE_ID: '',
    ELEVENLABS_MODEL_ID: 'eleven_multilingual_v2',
    ELEVENLABS_TIMEOUT_MS: 15_000,
    SHUTDOWN_POLICY: 'preserve-pending',
    ...overrides
  };
}

export function createTestLogger() {
  return createLogger('silent');
}

export async function createTempDir(prefix = 'alert-queue-'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanupTempDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

export function createAlertRequest(overrides: Partial<AlertRequest> = {}): AlertRequest {
  return {
    requestId: randomUUID(),
    correlationId: randomUUID(),
    source: 'local',
    receivedAt: nowIso(),
    alertType: 'cheer',
    payload: {
      userName: 'tester',
      message: 'hello queue'
    },
    ...overrides
  };
}

export function createAlertQueueItem(overrides: Partial<AlertQueueItem> = {}): AlertQueueItem {
  const request = createAlertRequest(overrides);

  return {
    ...request,
    jobId: randomUUID(),
    state: 'pending-memory',
    storageTier: 'memory',
    sequenceNumber: 1,
    admissionOutcome: 'accepted',
    enqueuedAt: nowIso(),
    ...overrides
  };
}

export async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 5_000, intervalMs = 20): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  await assertion();
}

export async function getAvailablePort(host = '127.0.0.1'): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to determine an available TCP port.')));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

export interface ParsedSseFrame {
  readonly event?: string;
  readonly id?: string;
  readonly data?: string;
  readonly comment?: string;
}

function parseSseFrame(frame: string): ParsedSseFrame {
  const normalizedLines = frame
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.length > 0);
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let comment: string | undefined;

  for (const line of normalizedLines) {
    if (line.startsWith(':')) {
      comment = line.slice(1).trim();
      continue;
    }
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('id:')) {
      id = line.slice('id:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  return {
    event,
    id,
    data: dataLines.length > 0 ? dataLines.join('\n') : undefined,
    comment
  };
}

export interface SseStreamHandle {
  readonly response: Response;
  nextFrame(timeoutMs?: number): Promise<ParsedSseFrame>;
  close(): Promise<void>;
}

export async function openSseStream(url: string): Promise<SseStreamHandle> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: {
      Accept: 'text/event-stream'
    },
    signal: controller.signal
  });

  if (!response.body) {
    throw new Error('SSE response did not include a body stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function nextFrame(timeoutMs = 5_000): Promise<ParsedSseFrame> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for SSE frame after ${timeoutMs} ms.`));
      }, timeoutMs);

      timeout.unref?.();
    });

    const readPromise = (async () => {
      while (true) {
        const separatorIndex = buffer.search(/\r?\n\r?\n/);
        if (separatorIndex >= 0) {
          const frame = buffer.slice(0, separatorIndex);
          const separatorLength = buffer[separatorIndex] === '\r' ? 4 : 2;
          buffer = buffer.slice(separatorIndex + separatorLength);
          return parseSseFrame(frame);
        }

        const { done, value } = await reader.read();
        if (done) {
          throw new Error('SSE stream ended before the next frame arrived.');
        }
        buffer += decoder.decode(value, { stream: true });
      }
    })();

    return Promise.race([readPromise, timeoutPromise]);
  }

  return {
    response,
    nextFrame,
    close: async () => {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  };
}

export async function openTestWebSocket(url: string): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    const handleOpen = () => {
      socket.removeEventListener('error', handleError);
      resolve(socket);
    };
    const handleError = (event: Event) => {
      socket.removeEventListener('open', handleOpen);
      reject(event);
    };

    socket.addEventListener('open', handleOpen, { once: true });
    socket.addEventListener('error', handleError, { once: true });
  });
}

export async function waitForWebSocketMessage(socket: WebSocket, timeoutMs = 5_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for a WebSocket message after ${timeoutMs} ms.`));
    }, timeoutMs);

    timeout.unref?.();

    const handleMessage = (event: MessageEvent) => {
      cleanup();
      resolve(typeof event.data === 'string' ? event.data : String(event.data));
    };
    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('error', handleError);
    };

    socket.addEventListener('message', handleMessage, { once: true });
    socket.addEventListener('error', handleError, { once: true });
  });
}

export async function waitForWebSocketClose(socket: WebSocket, timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for WebSocket close after ${timeoutMs} ms.`));
    }, timeoutMs);

    timeout.unref?.();

    const handleClose = () => {
      cleanup();
      resolve();
    };
    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('close', handleClose);
      socket.removeEventListener('error', handleError);
    };

    socket.addEventListener('close', handleClose, { once: true });
    socket.addEventListener('error', handleError, { once: true });
  });
}

interface PlaybackGate {
  readonly promise: Promise<void>;
  release(): void;
}

function createPlaybackGate(): PlaybackGate {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    promise,
    release
  };
}

export class ControlledPlayerAdapter implements PlayerAdapter {
  public readonly kind = 'controlled-test';
  public available = true;
  public readonly plays: Array<{ filePath: string; correlationId: string }> = [];
  private readonly gates: PlaybackGate[] = [];

  public blockNextPlayback(): PlaybackGate {
    const gate = createPlaybackGate();
    this.gates.push(gate);
    return gate;
  }

  public releaseAll(): void {
    while (this.gates.length > 0) {
      this.gates.shift()?.release();
    }
  }

  public async ensureAvailable(): Promise<boolean> {
    return this.available;
  }

  public async playAudio(filePath: string, correlationId: string): Promise<void> {
    this.plays.push({ filePath, correlationId });
    const gate = this.gates.shift();
    if (gate) {
      await gate.promise;
    }
  }
}

export class RecordingTextToSpeechClient implements TextToSpeechClient {
  public readonly sequenceNumbers: number[] = [];
  private readonly audioDir: string;
  private readonly failures = new Map<number, string>();

  public constructor(audioDir: string) {
    this.audioDir = audioDir;
  }

  public failSequence(sequenceNumber: number, message: string): void {
    this.failures.set(sequenceNumber, message);
  }

  public async synthesize(item: AlertQueueItem): Promise<SynthesizedAudio> {
    this.sequenceNumbers.push(item.sequenceNumber);
    const failureMessage = this.failures.get(item.sequenceNumber);
    if (failureMessage) {
      throw new Error(failureMessage);
    }

    await mkdir(this.audioDir, { recursive: true });
    const filePath = path.join(this.audioDir, `${item.sequenceNumber}-${item.jobId}.wav`);
    await writeFile(filePath, Buffer.alloc(16));

    return {
      filePath,
      mimeType: 'audio/wav'
    };
  }
}
