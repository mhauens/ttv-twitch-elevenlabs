import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppEnv } from '../config/env.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { AppLogger } from '../shared/logger.js';

export interface SynthesizedAudio {
  readonly filePath: string;
  readonly mimeType: string;
}

export interface TextToSpeechClient {
  synthesize(item: AlertQueueItem): Promise<SynthesizedAudio>;
}

export class ElevenLabsClient implements TextToSpeechClient {
  private readonly env: AppEnv;
  private readonly logger: AppLogger;

  public constructor(env: AppEnv, logger: AppLogger) {
    this.env = env;
    this.logger = logger;
  }

  public async synthesize(item: AlertQueueItem): Promise<SynthesizedAudio> {
    await mkdir(this.env.AUDIO_OUTPUT_DIR, { recursive: true });

    if (this.env.TTS_MODE === 'stub') {
      const filePath = path.join(this.env.AUDIO_OUTPUT_DIR, `${item.jobId}.wav`);
      await writeFile(filePath, createSilentWav());
      return { filePath, mimeType: 'audio/wav' };
    }

    if (!this.env.ELEVENLABS_API_KEY || !this.env.ELEVENLABS_VOICE_ID) {
      throw new Error('ElevenLabs credentials are required when TTS_MODE=elevenlabs.');
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.env.ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text: renderText(item),
          model_id: this.env.ELEVENLABS_MODEL_ID
        }),
        signal: AbortSignal.timeout(this.env.ELEVENLABS_TIMEOUT_MS)
      }
    );

    if (!response.ok) {
      this.logger.warn({ status: response.status, jobId: item.jobId }, 'ElevenLabs request failed.');
      throw new Error(`ElevenLabs request failed with status ${response.status}.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(this.env.AUDIO_OUTPUT_DIR, `${item.jobId}.mp3`);
    await writeFile(filePath, buffer);

    return { filePath, mimeType: 'audio/mpeg' };
  }
}

function renderText(item: AlertQueueItem): string {
  const message = typeof item.payload.message === 'string' ? item.payload.message : 'Alert received';
  const userName = typeof item.payload.userName === 'string' ? item.payload.userName : 'viewer';
  return `${userName}: ${message}`;
}

function createSilentWav(): Buffer {
  const sampleRate = 8000;
  const durationSeconds = 1;
  const samples = sampleRate * durationSeconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}