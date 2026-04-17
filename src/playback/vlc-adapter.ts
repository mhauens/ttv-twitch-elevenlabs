import type { AppEnv } from '../config/env.js';
import { CommandPlayerAdapter } from './player-adapter.js';

export class VlcAdapter extends CommandPlayerAdapter {
  public readonly kind = 'vlc';

  public constructor(env: AppEnv) {
    super(env);
  }

  protected buildArgs(filePath: string): string[] {
    return ['--intf', 'dummy', '--play-and-exit', filePath];
  }
}