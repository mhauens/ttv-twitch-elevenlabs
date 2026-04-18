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