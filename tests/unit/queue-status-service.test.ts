import { describe, expect, it } from 'vitest';

import { QueueStatusService } from '../../src/services/queue-status-service.js';
import { createTestLogger } from '../support/test-utils.js';

describe('QueueStatusService', () => {
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
});