import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPlayerAdapter } from '../../src/playback/player-adapter.js';
import { QueueStatusService } from '../../src/services/queue-status-service.js';
import { createTestLogger } from '../support/test-utils.js';
import { createTestEnv } from '../support/test-utils.js';

describe('QueueStatusService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates queue, failure, rejection, and health state', async () => {
    const service = new QueueStatusService(
      {
        getActiveSummary: () => ({
          jobId: 'job-1',
          alertType: 'cheer',
          state: 'active',
          activatedAt: '2026-04-17T00:00:00.000Z',
          correlationId: 'corr-1'
        }),
        getPendingDepth: () => 2,
        getOldestPendingAgeMs: () => 500
      } as never,
      {
        isReady: () => true,
        getDeferredDepth: async () => 3,
        listRecentFailures: async () => [
          {
            jobId: 'job-2',
            requestId: 'req-2',
            failureCode: 'FAILED',
            failureReason: 'boom',
            failedAt: '2026-04-17T00:00:01.000Z',
            recoveryFailure: false
          }
        ]
      } as never,
      {
        getRecentRejections: () => [
          {
            requestId: 'req-3',
            reasonCode: 'QUEUE_BACKPRESSURE_LIMIT',
            message: 'rejected',
            rejectedAt: '2026-04-17T00:00:02.000Z'
          }
        ]
      } as never,
      {
        getStatus: () => ({
          ready: true,
          restoredCount: 1,
          highestSequenceNumber: 4,
          message: 'Recovered 1 deferred alert.'
        })
      } as never,
      {
        ensureAvailable: async () => true
      } as never,
      5
    );

    const queueSnapshot = await service.getQueueSnapshot();
    const healthSnapshot = await service.getHealthSnapshot();

    expect(queueSnapshot.activeJob?.jobId).toBe('job-1');
    expect(queueSnapshot.deferredDepth).toBe(3);
    expect(queueSnapshot.recentRejections).toHaveLength(1);
    expect(healthSnapshot.ready).toBe(true);
    expect(healthSnapshot.recoveryMessage).toContain('Recovered');
    expect(createTestLogger()).toBeDefined();
  });

  it('caches player availability briefly so repeated health reads do not re-run expensive checks on every poll', async () => {
    vi.useFakeTimers();

    let availabilityChecks = 0;
    class CountingCommandPlayerAdapter extends CommandPlayerAdapter {
      public readonly kind = 'counting-test';

      public override async ensureAvailable(): Promise<boolean> {
        availabilityChecks += 1;
        return true;
      }

      protected buildArgs(...args: [string, string]): string[] {
        void args;
        return [];
      }
    }

    const service = new QueueStatusService(
      {
        getActiveSummary: () => undefined,
        getPendingDepth: () => 0,
        getOldestPendingAgeMs: () => 0
      } as never,
      {
        isReady: () => true,
        getDeferredDepth: async () => 0,
        listRecentFailures: async () => []
      } as never,
      {
        getRecentRejections: () => []
      } as never,
      {
        getStatus: () => ({
          ready: true,
          restoredCount: 0,
          highestSequenceNumber: 0,
          message: undefined
        })
      } as never,
      new CountingCommandPlayerAdapter(createTestEnv()) as never,
      5
    );

    await service.getHealthSnapshot();
    await service.getHealthSnapshot();
    expect(availabilityChecks).toBe(1);

    await vi.advanceTimersByTimeAsync(1_001);
    await service.getHealthSnapshot();
    expect(availabilityChecks).toBe(2);
  });
});
