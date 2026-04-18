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

describe('createApplication startup validation', () => {
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

  it('rejects startup when windows mode is configured on a non-Windows runtime', async () => {
    tempDir = await createTempDir('windows-server-');

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

  it('rejects startup when the local Windows speech path is unusable', async () => {
    tempDir = await createTempDir('windows-server-');

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
        windowsSpeechRunner: vi.fn().mockRejectedValue(new Error('Speech engine unavailable'))
      })
    ).rejects.toThrow('Windows TTS startup validation failed: Speech engine unavailable');
  });

  it('rejects startup when the configured audio output directory is unusable for windows mode', async () => {
    tempDir = await createTempDir('windows-server-');

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
        windowsSpeechRunner: vi.fn().mockResolvedValue(undefined),
        ensureWindowsOutputDirectory: vi.fn().mockRejectedValue(new Error('Audio output directory is not writable'))
      })
    ).rejects.toThrow('Windows TTS startup validation failed: Audio output directory is not writable');
  });
});
