import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppEnv } from '../config/env.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { AppLogger } from '../shared/logger.js';
import { renderAlertText } from '../shared/alert-text-renderer.js';
import type { SynthesizedAudio, TextToSpeechClient } from './text-to-speech-client.js';

export class ElevenLabsClient implements TextToSpeechClient {
  private readonly env: AppEnv;
  private readonly logger: AppLogger;

  public constructor(env: AppEnv, logger: AppLogger) {
    this.env = env;
    this.logger = logger;
  }

  public async synthesize(item: AlertQueueItem): Promise<SynthesizedAudio> {
    await mkdir(this.env.AUDIO_OUTPUT_DIR, { recursive: true });

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
          text: renderAlertText(item),
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