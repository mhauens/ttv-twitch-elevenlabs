import { describe, expect, it } from 'vitest';

import { QueueRecoveryService } from '../../src/services/queue-recovery-service.js';
import { createAlertQueueItem, createTestLogger } from '../support/test-utils.js';

describe('QueueRecoveryService', () => {
  it('marks interrupted active work as recovery-failed and primes deferred backlog', async () => {
    const interrupted = createAlertQueueItem({
      sequenceNumber: 7,
      state: 'active',
      activatedAt: '2026-04-17T00:00:00.000Z'
    });
    const recordedFailures: unknown[] = [];

    const service = new QueueRecoveryService(
      {
        resetRestoredPendingItems: async () => undefined,
        getActiveJob: async () => interrupted,
        getMaxSequenceNumber: async () => 7,
        recordRecoveryFailure: async (record: unknown) => {
          recordedFailures.push(record);
        },
        clearActiveJob: async () => undefined,
        getDeferredDepth: async () => 0
      } as never,
      {
        refillFromOverflow: async () => 2
      } as never,
      createTestLogger()
    );

    const status = await service.recover();

    expect(status.ready).toBe(true);
    expect(status.restoredCount).toBe(2);
    expect(status.highestSequenceNumber).toBe(7);
    expect(status.message).toContain('recovery-failed');
    expect(recordedFailures).toHaveLength(1);
  });

  it('marks recovery as unavailable when startup restoration throws', async () => {
    const service = new QueueRecoveryService(
      {
        resetRestoredPendingItems: async () => undefined,
        getActiveJob: async () => {
          throw new Error('restore failed');
        }
      } as never,
      {
        refillFromOverflow: async () => 0
      } as never,
      createTestLogger()
    );

    const status = await service.recover();

    expect(status.ready).toBe(false);
    expect(status.message).toContain('intake remains unavailable');
  });
});
