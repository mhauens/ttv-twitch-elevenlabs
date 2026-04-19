import { Router, type Request, type Response } from 'express';

import type { CombinedStatusSnapshot } from '../domain/combined-status-snapshot.js';
import { ApiError, sendApiError } from '../shared/errors.js';
import { StatusStreamUnavailableError, type StatusStreamService } from '../services/status-stream-service.js';

function writeSnapshotEvent(response: Response, snapshot: CombinedStatusSnapshot): void {
  response.write(`event: snapshot\n`);
  response.write(`id: ${snapshot.streamSequence}\n`);
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

export function buildStatusStreamRoute(statusStreamService: StatusStreamService): Router {
  const router = Router();

  router.get('/api/v1/status/stream', async (_request: Request, response: Response) => {
    let headersPrepared = false;
    const prepareResponse = () => {
      if (headersPrepared || response.headersSent) {
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      headersPrepared = true;
    };

    try {
      const subscription = await statusStreamService.subscribeSse({
        onSnapshot: (snapshot) => {
          prepareResponse();
          writeSnapshotEvent(response, snapshot);
        },
        onKeepalive: () => {
          prepareResponse();
          response.write(': keepalive\n\n');
        },
        onClose: () => {
          if (!response.writableEnded) {
            response.end();
          }
        }
      });

      const unsubscribe = () => {
        subscription.unsubscribe();
      };

      response.on('close', unsubscribe);
      response.on('error', unsubscribe);
    } catch (error) {
      if (error instanceof StatusStreamUnavailableError && !response.headersSent) {
        sendApiError(
          response,
          new ApiError(503, 'STATUS_STREAM_UNAVAILABLE', 'Status stream is currently unavailable.', response.locals.requestId)
        );
        return;
      }

      throw error;
    }
  });

  return router;
}
