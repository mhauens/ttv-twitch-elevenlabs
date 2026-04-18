import { describe, expect, it } from 'vitest';

import { normalizeAlertRequest } from '../../src/integrations/event-normalizer.js';

describe('normalizeAlertRequest', () => {
  it('accepts mixitup and preserves the canonical request shape', () => {
    const normalized = normalizeAlertRequest({
      source: 'mixitup',
      alertType: 'follow',
      dedupeKey: 'mix-1',
      payload: {
        userName: 'viewer123',
        message: 'Willkommen im Stream'
      }
    });

    expect(normalized).toMatchObject({
      source: 'mixitup',
      alertType: 'follow',
      dedupeKey: 'mix-1',
      payload: {
        userName: 'viewer123',
        message: 'Willkommen im Stream'
      }
    });
    expect(normalized.requestId).toEqual(expect.any(String));
    expect(normalized.correlationId).toEqual(expect.any(String));
    expect(normalized.receivedAt).toEqual(expect.any(String));
  });

  it('rejects unsupported source values', () => {
    expect(() =>
      normalizeAlertRequest({
        source: 'unsupported',
        alertType: 'follow',
        payload: {
          userName: 'viewer123'
        }
      })
    ).toThrow();
  });
});