export type AlertSource = 'local' | 'twitch' | 'streamerbot';

export interface AlertRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly source: AlertSource;
  readonly dedupeKey?: string;
  readonly receivedAt: string;
  readonly alertType: string;
  readonly payload: Record<string, unknown>;
}