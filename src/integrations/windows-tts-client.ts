import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { AppEnv } from '../config/env.js';
import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { AppLogger } from '../shared/logger.js';
import { renderAlertText } from '../shared/alert-text-renderer.js';
import type { SynthesizedAudio, TextToSpeechClient } from './text-to-speech-client.js';

const execFileAsync = promisify(execFile);
const windowsTtsTimeoutMs = 15_000;

export interface WindowsSpeechRunnerRequest {
  readonly mode: 'validate-startup' | 'synthesize';
  readonly outputPath?: string;
  readonly text?: string;
  readonly timeoutMs: number;
}

export type WindowsSpeechRunner = (request: WindowsSpeechRunnerRequest) => Promise<void>;

export interface WindowsTextToSpeechClientOptions {
  readonly platform?: NodeJS.Platform;
  readonly speechRunner?: WindowsSpeechRunner;
  readonly ensureOutputDirectory?: (directoryPath: string) => Promise<void>;
  readonly removeOutputFile?: (filePath: string) => Promise<void>;
}

export class WindowsTextToSpeechClient implements TextToSpeechClient {
  private readonly env: AppEnv;
  private readonly logger: AppLogger;
  private readonly platform: NodeJS.Platform;
  private readonly speechRunner: WindowsSpeechRunner;
  private readonly ensureOutputDirectory: (directoryPath: string) => Promise<void>;
  private readonly removeOutputFile: (filePath: string) => Promise<void>;

  public constructor(env: AppEnv, logger: AppLogger, options: WindowsTextToSpeechClientOptions = {}) {
    this.env = env;
    this.logger = logger;
    this.platform = options.platform ?? process.platform;
    this.speechRunner = options.speechRunner ?? runWindowsSpeech;
    this.ensureOutputDirectory =
      options.ensureOutputDirectory ??
      (async (directoryPath: string): Promise<void> => {
        await mkdir(directoryPath, { recursive: true });
      });
    this.removeOutputFile = options.removeOutputFile ?? ((filePath: string) => unlink(filePath));
  }

  public async validateStartup(): Promise<void> {
    this.assertWindowsPlatform();

    const validationOutputPath = path.join(this.env.AUDIO_OUTPUT_DIR, `startup-validation-${randomUUID()}.wav`);

    try {
      await this.ensureOutputDirectory(this.env.AUDIO_OUTPUT_DIR);
      await this.speechRunner({
        mode: 'validate-startup',
        outputPath: validationOutputPath,
        text: 'startup validation',
        timeoutMs: windowsTtsTimeoutMs
      });
    } catch (error) {
      const message = toWindowsTtsErrorMessage(error, 'startup validation');
      this.logger.error({ error: message, ttsMode: this.env.TTS_MODE }, 'Windows TTS startup validation failed.');
      throw new Error(message, { cause: error });
    } finally {
      await this.removeOutputFile(validationOutputPath).catch(() => undefined);
    }
  }

  public async synthesize(item: AlertQueueItem): Promise<SynthesizedAudio> {
    this.assertWindowsPlatform();

    const filePath = path.join(this.env.AUDIO_OUTPUT_DIR, `${item.jobId}.wav`);

    try {
      await this.ensureOutputDirectory(this.env.AUDIO_OUTPUT_DIR);
      await this.speechRunner({
        mode: 'synthesize',
        outputPath: filePath,
        text: renderAlertText(item),
        timeoutMs: windowsTtsTimeoutMs
      });
    } catch (error) {
      await this.removeOutputFile(filePath).catch(() => undefined);
      const message = toWindowsTtsErrorMessage(error, 'synthesis');
      this.logger.warn({ error: message, jobId: item.jobId }, 'Windows TTS synthesis failed.');
      throw new Error(message, { cause: error });
    }

    return { filePath, mimeType: 'audio/wav' };
  }

  private assertWindowsPlatform(): void {
    if (this.platform !== 'win32') {
      throw new Error('TTS_MODE=windows is only supported on Windows.');
    }
  }
}

export async function runWindowsSpeech(request: WindowsSpeechRunnerRequest): Promise<void> {
  const script = buildPowerShellScript(request);

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellScript(script)],
    {
      timeout: request.timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }
  );
}

function buildPowerShellScript(request: WindowsSpeechRunnerRequest): string {
  if (request.mode === 'validate-startup') {
    const outputPath = escapePowerShellString(request.outputPath ?? '');
    const text = escapePowerShellString(request.text ?? 'startup validation');

    return [
      'Add-Type -AssemblyName System.Speech',
      '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      'try {',
      '  $voice = $synth.Voice',
      "  if ($null -eq $voice -or [string]::IsNullOrWhiteSpace($voice.Name)) { throw 'No default Windows speech voice available.' }",
      `  $synth.SetOutputToWaveFile('${outputPath}')`,
      `  $synth.Speak('${text}')`,
      '} finally {',
      '  $synth.Dispose()',
      '}'
    ].join('\n');
  }

  const outputPath = escapePowerShellString(request.outputPath ?? '');
  const text = escapePowerShellString(request.text ?? '');

  return [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try {',
    `  $synth.SetOutputToWaveFile('${outputPath}')`,
    `  $synth.Speak('${text}')`,
    '} finally {',
    '  $synth.Dispose()',
    '}'
  ].join('\n');
}

function encodePowerShellScript(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function toWindowsTtsErrorMessage(error: unknown, stage: 'startup validation' | 'synthesis'): string {
  const details = extractPowerShellErrorDetails(error);

  if (details.code === 'ENOENT') {
    return 'Windows TTS requires powershell.exe to be available.';
  }

  return `Windows TTS ${stage} failed: ${details.message}`;
}

function extractPowerShellErrorDetails(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string; stderr?: string; stdout?: string };
    const message = withCode.stderr?.trim() || withCode.stdout?.trim() || error.message;
    return { message, code: withCode.code };
  }

  return { message: 'Unknown Windows TTS failure.' };
}
