import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApplication, type ApplicationContext } from '../../src/app/server.js';
import {
  ControlledPlayerAdapter,
  cleanupTempDir,
  createTempDir,
  createTestEnv,
  createTestLogger
} from '../support/test-utils.js';

describe('windows TTS startup integration', () => {
  let application: ApplicationContext | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (application) {
      await application.stop();
      application = undefined;
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it('refuses startup for invalid windows mode configuration on non-Windows runtime', async () => {
    tempDir = await createTempDir('windows-tts-integration-');

    await expect(
      createApplication({
        env: createTestEnv({
          TTS_MODE: 'windows',
          QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
          AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
        }),
        logger: createTestLogger(),
        playerAdapter: new ControlledPlayerAdapter(),
        runtimePlatform: 'linux',
        windowsSpeechRunner: vi.fn().mockResolvedValue(undefined)
      })
    ).rejects.toThrow('TTS_MODE=windows is only supported on Windows.');
  });

  it('fails startup before readiness when the Windows speech path is unusable', async () => {
    tempDir = await createTempDir('windows-tts-integration-');

    await expect(
      createApplication({
        env: createTestEnv({
          TTS_MODE: 'windows',
          QUEUE_DB_PATH: path.join(tempDir, 'alerts.sqlite'),
          AUDIO_OUTPUT_DIR: path.join(tempDir, 'audio')
        }),
        logger: createTestLogger(),
        playerAdapter: new ControlledPlayerAdapter(),
        runtimePlatform: 'win32',
        windowsSpeechRunner: vi.fn().mockRejectedValue(new Error('No default voice available'))
      })
    ).rejects.toThrow('Windows TTS startup validation failed: No default voice available');
  });
});