import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  QUEUE_MEMORY_LIMIT: z.coerce.number().int().positive().default(25),
  QUEUE_DEFERRED_LIMIT: z.coerce.number().int().positive().default(1000),
  QUEUE_RECENT_FAILURE_LIMIT: z.coerce.number().int().positive().default(20),
  QUEUE_RECENT_REJECTION_LIMIT: z.coerce.number().int().positive().default(20),
  QUEUE_DB_PATH: z.string().min(1).default('.queue-data/alerts.sqlite'),
  AUDIO_OUTPUT_DIR: z.string().min(1).default('.audio-output'),
  PLAYER_KIND: z.enum(['vlc', 'mpv']).default('vlc'),
  PLAYER_COMMAND: z.string().min(1).default('vlc'),
  PLAYER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  TTS_MODE: z.enum(['stub', 'elevenlabs', 'windows']).default('stub'),
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_VOICE_ID: z.string().optional().default(''),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  ELEVENLABS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  SHUTDOWN_POLICY: z.enum(['preserve-pending', 'discard-pending']).default('preserve-pending')
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function loadEnv(overrides?: Record<string, string | undefined>): AppEnv {
  if (!overrides && cachedEnv) {
    return cachedEnv;
  }

  loadDotEnv();
  const parsed = envSchema.parse({
    ...process.env,
    ...overrides
  });

  if (!overrides) {
    cachedEnv = parsed;
  }

  return parsed;
}