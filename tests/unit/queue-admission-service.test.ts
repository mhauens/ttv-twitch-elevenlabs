import { describe, expect, it } from 'vitest';

import { QueueAdmissionService } from '../../src/services/queue-admission-service.js';
import { createTestLogger, createAlertRequest } from '../support/test-utils.js';

describe('QueueAdmissionService', () => {
  it('accepts alerts into memory when capacity is available and no deferred backlog exists', async () => {
    const queuedItems: unknown[] = [];
    const service = new QueueAdmissionService({
      queueConfig: {
        inMemoryLimit: 2,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      orchestrator: {
        enqueue: async (item: unknown) => {
          queuedItems.push(item);
        },
        getInMemoryWorkCount: () => 0,
        getPendingDepth: () => 1
      } as never,
      overflowStore: {
        isReady: () => true,
        saveLastSequenceNumber: async () => undefined,
        getDeferredDepth: async () => 0,
        persistDeferred: async () => undefined
      } as never,
      queueRecoveryService: {
        getStatus: () => ({ ready: true, restoredCount: 0, highestSequenceNumber: 0 })
      } as never,
      playerAdapter: {
        ensureAvailable: async () => true
      } as never,
      logger: createTestLogger(),
      initialSequenceNumber: 0
    });

    const decision = await service.admit(createAlertRequest());

    expect(decision.kind).toBe('accepted');
    if (decision.kind !== 'accepted') {
      throw new Error('expected an accepted decision');
    }

    expect(decision.statusCode).toBe(202);
    expect(decision.result.outcome).toBe('accepted');
    expect(queuedItems).toHaveLength(1);
  });

  it('defers new work to durable overflow while an older deferred backlog exists', async () => {
    const deferredItems: unknown[] = [];
    const service = new QueueAdmissionService({
      queueConfig: {
        inMemoryLimit: 2,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      orchestrator: {
        enqueue: async () => {
          throw new Error('should not enqueue into memory while deferred backlog exists');
        },
        getInMemoryWorkCount: () => 0,
        getPendingDepth: () => 0
      } as never,
      overflowStore: {
        isReady: () => true,
        saveLastSequenceNumber: async () => undefined,
        getDeferredDepth: async () => 1,
        persistDeferred: async (item: unknown) => {
          deferredItems.push(item);
        }
      } as never,
      queueRecoveryService: {
        getStatus: () => ({ ready: true, restoredCount: 0, highestSequenceNumber: 3 })
      } as never,
      playerAdapter: {
        ensureAvailable: async () => true
      } as never,
      logger: createTestLogger(),
      initialSequenceNumber: 3
    });

    const decision = await service.admit(createAlertRequest());

    expect(decision.kind).toBe('accepted');
    if (decision.kind !== 'accepted') {
      throw new Error('expected an accepted decision');
    }

    expect(decision.result.outcome).toBe('deferred-to-disk');
    expect(deferredItems).toHaveLength(1);
  });

  it('returns duplicate-handled outcomes without creating new queue side effects', async () => {
    const deferredItems: unknown[] = [];
    const service = new QueueAdmissionService({
      queueConfig: {
        inMemoryLimit: 1,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      orchestrator: {
        enqueue: async () => undefined,
        getInMemoryWorkCount: () => 1,
        getPendingDepth: () => 0
      } as never,
      overflowStore: {
        isReady: () => true,
        saveLastSequenceNumber: async () => undefined,
        getDeferredDepth: async () => 0,
        persistDeferred: async (item: unknown) => {
          deferredItems.push(item);
        }
      } as never,
      queueRecoveryService: {
        getStatus: () => ({ ready: true, restoredCount: 0, highestSequenceNumber: 0 })
      } as never,
      playerAdapter: {
        ensureAvailable: async () => true
      } as never,
      logger: createTestLogger(),
      initialSequenceNumber: 0
    });

    const first = await service.admit(createAlertRequest({ dedupeKey: 'dup-1' }));
    const second = await service.admit(createAlertRequest({ dedupeKey: 'dup-1' }));

    expect(first.kind).toBe('accepted');
    expect(second.kind).toBe('accepted');
    if (second.kind !== 'accepted') {
      throw new Error('expected an accepted decision');
    }

    expect(second.statusCode).toBe(409);
    expect(second.result.outcome).toBe('duplicate-handled');
    expect(deferredItems).toHaveLength(1);
  });

  it('rejects intake when the configured player is unavailable', async () => {
    const service = new QueueAdmissionService({
      queueConfig: {
        inMemoryLimit: 2,
        deferredLimit: 5,
        recentFailureLimit: 5,
        recentRejectionLimit: 5,
        shutdownPolicy: 'preserve-pending'
      },
      orchestrator: {
        enqueue: async () => undefined,
        getInMemoryWorkCount: () => 0,
        getPendingDepth: () => 0
      } as never,
      overflowStore: {
        isReady: () => true,
        saveLastSequenceNumber: async () => undefined,
        getDeferredDepth: async () => 0,
        persistDeferred: async () => undefined
      } as never,
      queueRecoveryService: {
        getStatus: () => ({ ready: true, restoredCount: 0, highestSequenceNumber: 0 })
      } as never,
      playerAdapter: {
        ensureAvailable: async () => false
      } as never,
      logger: createTestLogger(),
      initialSequenceNumber: 0
    });

    const decision = await service.admit(createAlertRequest());

    expect(decision.kind).toBe('rejected');
    if (decision.kind !== 'rejected') {
      throw new Error('expected a rejected decision');
    }

    expect(decision.error.statusCode).toBe(503);
    expect(decision.error.code).toBe('PLAYER_UNAVAILABLE');
  });
});
