import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { WindowsTextToSpeechClient } from '../../src/integrations/windows-tts-client.js';
import {
  cleanupTempDir,
  createAlertQueueItem,
  createTempDir,
  createTestEnv,
  createTestLogger
} from '../support/test-utils.js';

describe('WindowsTextToSpeechClient', () => {
  it('rejects startup validation on non-Windows platforms', async () => {
    const client = new WindowsTextToSpeechClient(createTestEnv({ TTS_MODE: 'windows' }), createTestLogger(), {
      platform: 'linux',
      speechRunner: vi.fn()
    });

    await expect(client.validateStartup()).rejects.toThrow('TTS_MODE=windows is only supported on Windows.');
  });

  it('propagates startup validation failures from the speech runner', async () => {
    const client = new WindowsTextToSpeechClient(createTestEnv({ TTS_MODE: 'windows' }), createTestLogger(), {
      platform: 'win32',
      speechRunner: vi.fn().mockRejectedValue(new Error('SpeechSynthesizer unavailable'))
    });

    await expect(client.validateStartup()).rejects.toThrow(
      'Windows TTS startup validation failed: SpeechSynthesizer unavailable'
    );
  });

  it('writes and cleans up a startup validation WAV artifact', async () => {
    const tempDir = await createTempDir('windows-tts-startup-');

    try {
      const runner = vi.fn().mockImplementation(async ({ outputPath }) => {
        if (outputPath) {
          await writeFile(outputPath, Buffer.from('RIFF'));
        }
      });
      const client = new WindowsTextToSpeechClient(
        createTestEnv({ TTS_MODE: 'windows', AUDIO_OUTPUT_DIR: tempDir }),
        createTestLogger(),
        {
          platform: 'win32',
          speechRunner: runner
        }
      );

      await client.validateStartup();

      expect(runner).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'validate-startup',
          text: 'startup validation',
          timeoutMs: 15000
        })
      );
      const outputPath = runner.mock.calls[0]?.[0].outputPath;
      expect(outputPath).toBeTruthy();
      await expect(access(outputPath!)).rejects.toThrow();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('fails startup validation when the configured audio output directory is unusable', async () => {
    const runner = vi.fn();
    const client = new WindowsTextToSpeechClient(
      createTestEnv({ TTS_MODE: 'windows' }),
      createTestLogger(),
      {
        platform: 'win32',
        speechRunner: runner,
        ensureOutputDirectory: vi.fn().mockRejectedValue(new Error('Audio output directory is not writable'))
      }
    );

    await expect(client.validateStartup()).rejects.toThrow(
      'Windows TTS startup validation failed: Audio output directory is not writable'
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it('creates a WAV artifact and returns audio/wav on successful synthesis', async () => {
    const tempDir = await createTempDir('windows-tts-');

    try {
      const env = createTestEnv({ TTS_MODE: 'windows', AUDIO_OUTPUT_DIR: tempDir });
      const client = new WindowsTextToSpeechClient(env, createTestLogger(), {
        platform: 'win32',
        speechRunner: async ({ mode, outputPath }) => {
          if (mode === 'synthesize' && outputPath) {
            await writeFile(outputPath, Buffer.from('RIFF'));
          }
        }
      });

      const result = await client.synthesize(
        createAlertQueueItem({ jobId: 'job-1', payload: { userName: 'tester', message: 'hello windows' } })
      );

      expect(result.mimeType).toBe('audio/wav');
      expect(path.basename(result.filePath)).toBe('job-1.wav');
      await access(result.filePath);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('propagates synthesis failures as standard provider errors', async () => {
    const tempDir = await createTempDir('windows-tts-failure-');

    try {
      const client = new WindowsTextToSpeechClient(
        createTestEnv({ TTS_MODE: 'windows', AUDIO_OUTPUT_DIR: tempDir }),
        createTestLogger(),
        {
          platform: 'win32',
          speechRunner: vi.fn().mockImplementation(async ({ outputPath }) => {
            if (outputPath) {
              await writeFile(outputPath, Buffer.from('RIFF'));
            }
            throw new Error('Speak failed');
          })
        }
      );

      const job = createAlertQueueItem({ jobId: 'job-failure' });
      await expect(client.synthesize(job)).rejects.toThrow('Windows TTS synthesis failed: Speak failed');
      await expect(access(path.join(tempDir, 'job-failure.wav'))).rejects.toThrow();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
