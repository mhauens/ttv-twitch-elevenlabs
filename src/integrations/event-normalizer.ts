import { z } from 'zod';

import type { AlertRequest } from '../domain/alert-request.js';
import { createCorrelationId, createRequestId } from '../shared/ids.js';
import { nowIso } from '../shared/time.js';

export const alertRequestBodySchema = z.object({
  source: z.enum(['local', 'twitch', 'streamerbot', 'mixitup']),
  alertType: z.string().min(1),
  dedupeKey: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown())
});

export type AlertRequestBody = z.infer<typeof alertRequestBodySchema>;

export function normalizeAlertRequest(body: unknown): AlertRequest {
  const parsed = alertRequestBodySchema.parse(body);

  return {
    requestId: createRequestId(),
    correlationId: createCorrelationId(),
    source: parsed.source,
    dedupeKey: parsed.dedupeKey,
    receivedAt: nowIso(),
    alertType: parsed.alertType,
    payload: parsed.payload
  };
}