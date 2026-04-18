import type { AlertQueueItem } from '../domain/alert-queue-item.js';

export interface SynthesizedAudio {
  readonly filePath: string;
  readonly mimeType: string;
}

export interface TextToSpeechClient {
  synthesize(item: AlertQueueItem): Promise<SynthesizedAudio>;
}