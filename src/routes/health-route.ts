import { Router, type Request, type Response } from 'express';

import type { QueueStatusService } from '../services/queue-status-service.js';

export function buildHealthRoute(queueStatusService: QueueStatusService): Router {
  const router = Router();

  router.get('/api/v1/health', async (_request: Request, response: Response) => {
    const snapshot = await queueStatusService.getHealthSnapshot();
    response.status(snapshot.ready ? 200 : 503).json({
      status: snapshot.ready ? 'ok' : 'unavailable',
      data: snapshot
    });
  });

  return router;
}