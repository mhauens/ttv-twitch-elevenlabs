import type { AppEnv } from '../config/env.js';
import type { AppLogger } from '../shared/logger.js';
import { ElevenLabsClient } from './elevenlabs-client.js';
import { StubTextToSpeechClient } from './stub-tts-client.js';
import type { TextToSpeechClient } from './text-to-speech-client.js';
import { WindowsTextToSpeechClient, type WindowsSpeechRunner } from './windows-tts-client.js';

export interface CreateTextToSpeechClientOptions {
  readonly env: AppEnv;
  readonly logger: AppLogger;
  readonly runtimePlatform?: NodeJS.Platform;
  readonly windowsSpeechRunner?: WindowsSpeechRunner;
  readonly ensureWindowsOutputDirectory?: (directoryPath: string) => Promise<void>;
  readonly removeWindowsOutputFile?: (filePath: string) => Promise<void>;
}

export async function createTextToSpeechClient(options: CreateTextToSpeechClientOptions): Promise<TextToSpeechClient> {
  const {
    env,
    logger,
    runtimePlatform,
    windowsSpeechRunner,
    ensureWindowsOutputDirectory,
    removeWindowsOutputFile
  } = options;

  if (env.TTS_MODE === 'stub') {
    return new StubTextToSpeechClient(env);
  }

  if (env.TTS_MODE === 'windows') {
    const client = new WindowsTextToSpeechClient(env, logger, {
      platform: runtimePlatform,
      speechRunner: windowsSpeechRunner,
      ensureOutputDirectory: ensureWindowsOutputDirectory,
      removeOutputFile: removeWindowsOutputFile
    });

    await client.validateStartup();
    return client;
  }

  return new ElevenLabsClient(env, logger);
}
