import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { OverflowStore } from '../../src/services/overflow-store.js';
import {
  cleanupTempDir,
  createAlertQueueItem,
  createTempDir,
  createTestLogger
} from '../support/test-utils.js';

describe('OverflowStore', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it('persists and restores deferred items in sequence order with bounded promotion', async () => {
    tempDir = await createTempDir();
    const store = new OverflowStore(path.join(tempDir, 'alerts.sqlite'), createTestLogger());
    await store.initialize();

    await store.persistDeferred(
      createAlertQueueItem({
        sequenceNumber: 2,
        state: 'deferred-overflow',
        storageTier: 'deferred-overflow',
        admissionOutcome: 'deferred-to-disk'
      })
    );
    await store.persistDeferred(
      createAlertQueueItem({
        sequenceNumber: 1,
        state: 'deferred-overflow',
        storageTier: 'deferred-overflow',
        admissionOutcome: 'deferred-to-disk'
      })
    );

    const firstBatch = await store.restoreDeferredItems(1);
    const remainingDepth = await store.getDeferredDepth();
    const secondBatch = await store.restoreDeferredItems();

    expect(firstBatch.map((item) => item.sequenceNumber)).toEqual([1]);
    expect(remainingDepth).toBe(1);
    expect(secondBatch.map((item) => item.sequenceNumber)).toEqual([2]);

    await store.dispose();
  });

  it('records active jobs, failure history, and last sequence state', async () => {
    tempDir = await createTempDir();
    const store = new OverflowStore(path.join(tempDir, 'alerts.sqlite'), createTestLogger());
    await store.initialize();

    const activeItem = createAlertQueueItem({ sequenceNumber: 9, state: 'active', activatedAt: '2026-04-17T00:00:00.000Z' });
    await store.writeActiveJob(activeItem);
    await store.recordFailure({
      jobId: activeItem.jobId,
      requestId: activeItem.requestId,
      failureCode: 'FAILED',
      failureReason: 'boom',
      failedAt: '2026-04-17T00:00:01.000Z',
      recoveryFailure: false
    });

    const persistedActive = await store.getActiveJob();
    const recentFailures = await store.listRecentFailures(5);
    const maxSequenceNumber = await store.getMaxSequenceNumber();

    expect(persistedActive?.jobId).toBe(activeItem.jobId);
    expect(recentFailures).toHaveLength(1);
    expect(maxSequenceNumber).toBe(9);

    await store.dispose();
  });

  it('keeps restored deferred items durable until they become active', async () => {
    tempDir = await createTempDir();
    const dbPath = path.join(tempDir, 'alerts.sqlite');
    const store = new OverflowStore(dbPath, createTestLogger());
    await store.initialize();

    const deferredItem = createAlertQueueItem({
      sequenceNumber: 4,
      state: 'deferred-overflow',
      storageTier: 'deferred-overflow',
      admissionOutcome: 'deferred-to-disk'
    });
    await store.persistDeferred(deferredItem);

    const restored = await store.restoreDeferredItems(1);
    expect(restored.map((item) => item.jobId)).toEqual([deferredItem.jobId]);
    expect(await store.getDeferredDepth()).toBe(0);

    await store.dispose();

    const reopenedStore = new OverflowStore(dbPath, createTestLogger());
    await reopenedStore.initialize();
    await reopenedStore.resetRestoredPendingItems();

    const recovered = await reopenedStore.restoreDeferredItems(1);
    expect(recovered.map((item) => item.jobId)).toEqual([deferredItem.jobId]);

    await reopenedStore.writeActiveJob({
      ...recovered[0],
      state: 'active',
      activatedAt: '2026-04-17T00:00:00.000Z'
    });

    expect(await reopenedStore.getDeferredDepth()).toBe(0);

    await reopenedStore.dispose();
  });
});
