import { describe, expect, it, vi } from 'vitest';

import { ElevenLabsClient } from '../../src/integrations/elevenlabs-client.js';
import { StubTextToSpeechClient } from '../../src/integrations/stub-tts-client.js';
import { createTextToSpeechClient } from '../../src/integrations/tts-client-factory.js';
import { WindowsTextToSpeechClient } from '../../src/integrations/windows-tts-client.js';
import { createTestEnv, createTestLogger } from '../support/test-utils.js';

describe('createTextToSpeechClient', () => {
  it('returns the stub client when TTS_MODE=stub', async () => {
    const client = await createTextToSpeechClient({
      env: createTestEnv({ TTS_MODE: 'stub' }),
      logger: createTestLogger()
    });

    expect(client).toBeInstanceOf(StubTextToSpeechClient);
  });

  it('returns the ElevenLabs client when TTS_MODE=elevenlabs', async () => {
    const client = await createTextToSpeechClient({
      env: createTestEnv({ TTS_MODE: 'elevenlabs' }),
      logger: createTestLogger()
    });

    expect(client).toBeInstanceOf(ElevenLabsClient);
  });

  it('returns the Windows client and validates startup when TTS_MODE=windows', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const ensureOutputDirectory = vi.fn().mockResolvedValue(undefined);

    const client = await createTextToSpeechClient({
      env: createTestEnv({ TTS_MODE: 'windows' }),
      logger: createTestLogger(),
      runtimePlatform: 'win32',
      windowsSpeechRunner: runner,
      ensureWindowsOutputDirectory: ensureOutputDirectory
    });

    expect(client).toBeInstanceOf(WindowsTextToSpeechClient);
    expect(ensureOutputDirectory).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'validate-startup',
        text: 'startup validation',
        timeoutMs: 15000
      })
    );
    expect(runner.mock.calls[0]?.[0].outputPath).toMatch(/startup-validation-.*\.wav$/);
  });
});
