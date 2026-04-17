import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { AppEnv } from '../config/env.js';

const execFileAsync = promisify(execFile);

export interface PlayerAdapter {
  readonly kind: string;
  ensureAvailable(): Promise<boolean>;
  playAudio(filePath: string, correlationId: string): Promise<void>;
}

export abstract class CommandPlayerAdapter implements PlayerAdapter {
  protected readonly env: AppEnv;
  public abstract readonly kind: string;

  public constructor(env: AppEnv) {
    this.env = env;
  }

  public async ensureAvailable(): Promise<boolean> {
    if (this.looksLikeExplicitPath(this.env.PLAYER_COMMAND)) {
      try {
        await access(this.env.PLAYER_COMMAND);
        return true;
      } catch {
        return false;
      }
    }

    try {
      await execFileAsync('where', [this.env.PLAYER_COMMAND], { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  public async playAudio(filePath: string, correlationId: string): Promise<void> {
    await execFileAsync(this.env.PLAYER_COMMAND, this.buildArgs(filePath, correlationId), {
      timeout: this.env.PLAYER_TIMEOUT_MS,
      windowsHide: true
    });
  }

  protected abstract buildArgs(filePath: string, correlationId: string): string[];

  private looksLikeExplicitPath(command: string): boolean {
    return path.isAbsolute(command) || command.includes('\\') || command.includes('/');
  }
}

export async function createPlayerAdapter(env: AppEnv): Promise<PlayerAdapter> {
  if (env.PLAYER_KIND === 'mpv') {
    return new (await import('./mpv-adapter.js')).MpvAdapter(env);
  }

  return new (await import('./vlc-adapter.js')).VlcAdapter(env);
}
