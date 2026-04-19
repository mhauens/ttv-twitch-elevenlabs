import { describe, expect, it } from 'vitest';

import { resolveUpgradeRequestPath } from '../../src/app/server.js';

describe('resolveUpgradeRequestPath', () => {
  it('extracts the pathname from relative upgrade requests', () => {
    expect(resolveUpgradeRequestPath('/api/v1/status/ws?token=test')).toBe('/api/v1/status/ws');
  });

  it('extracts the pathname from absolute IPv6 upgrade requests without depending on HOST formatting', () => {
    expect(resolveUpgradeRequestPath('ws://[::1]:3000/api/v1/status/ws?token=test')).toBe('/api/v1/status/ws');
  });

  it('returns an empty path for malformed absolute upgrade requests instead of throwing', () => {
    expect(resolveUpgradeRequestPath('ws://[::1')).toBe('');
  });

  it('returns an empty path when the upgrade request has no URL', () => {
    expect(resolveUpgradeRequestPath(undefined)).toBe('');
  });
});
