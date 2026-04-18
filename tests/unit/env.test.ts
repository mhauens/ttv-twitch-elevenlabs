import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('accepts windows as a valid TTS mode', () => {
    const env = loadEnv({ TTS_MODE: 'windows' });

    expect(env.TTS_MODE).toBe('windows');
  });
});