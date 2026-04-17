import { Router, type Request, type Response } from 'express';

import type { QueueStatusService } from '../services/queue-status-service.js';

export function buildQueueStatusRoute(queueStatusService: QueueStatusService): Router {
  const router = Router();

  router.get('/api/v1/queue', async (_request: Request, response: Response) => {
    const snapshot = await queueStatusService.getQueueSnapshot();
    response.status(200).json({
      status: 'ok',
      data: snapshot
    });
  });

  return router;
}