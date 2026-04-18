import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppEnv } from '../config/env.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { SynthesizedAudio, TextToSpeechClient } from './text-to-speech-client.js';

export class StubTextToSpeechClient implements TextToSpeechClient {
  private readonly env: AppEnv;

  public constructor(env: AppEnv) {
    this.env = env;
  }

  public async synthesize(item: AlertQueueItem): Promise<SynthesizedAudio> {
    await mkdir(this.env.AUDIO_OUTPUT_DIR, { recursive: true });

    const filePath = path.join(this.env.AUDIO_OUTPUT_DIR, `${item.jobId}.wav`);
    await writeFile(filePath, createSilentWav());

    return { filePath, mimeType: 'audio/wav' };
  }
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