import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { normalizeAlertRequest } from '../integrations/event-normalizer.js';
import { ApiError, sendApiError } from '../shared/errors.js';
import type { AppLogger } from '../shared/logger.js';
import type { QueueAdmissionService } from '../services/queue-admission-service.js';

export function buildAlertsRoute(queueAdmissionService: QueueAdmissionService, logger: AppLogger): Router {
  const router = Router();

  router.post('/api/v1/alerts', async (request: Request, response: Response) => {
    try {
      const normalizedRequest = normalizeAlertRequest(request.body);
      const decision = await queueAdmissionService.admit(normalizedRequest);

      if (decision.kind === 'rejected') {
        sendApiError(response, decision.error);
        return;
      }

      response.status(decision.statusCode).json({
        status: 'accepted',
        data: decision.result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        sendApiError(
          response,
          new ApiError(400, 'INVALID_ALERT_REQUEST', 'Alert payload failed validation.', response.locals.requestId)
        );
        return;
      }

      logger.error({ error }, 'Unexpected alert intake failure.');
      sendApiError(
        response,
        new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Unexpected error while admitting alert.', response.locals.requestId)
      );
    }
  });

  return router;
}