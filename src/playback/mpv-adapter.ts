import type { AppEnv } from '../config/env.js';
import { CommandPlayerAdapter } from './player-adapter.js';

export class MpvAdapter extends CommandPlayerAdapter {
  public readonly kind = 'mpv';

  public constructor(env: AppEnv) {
    super(env);
  }

  protected buildArgs(filePath: string): string[] {
    return ['--no-terminal', '--really-quiet', filePath];
  }
}