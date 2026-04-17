import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { createQueueConfig } from '../config/queue-config.js';
import { loadEnv, type AppEnv } from '../config/env.js';
import { ElevenLabsClient, type TextToSpeechClient } from '../integrations/elevenlabs-client.js';
import { createPlayerAdapter, type PlayerAdapter } from '../playback/player-adapter.js';
import { buildAlertsRoute } from '../routes/alerts-route.js';
import { buildHealthRoute } from '../routes/health-route.js';
import { buildQueueStatusRoute } from '../routes/queue-status-route.js';
import { AlertOrchestrator } from '../services/alert-orchestrator.js';
import { OverflowStore } from '../services/overflow-store.js';
import { QueueAdmissionService } from '../services/queue-admission-service.js';
import { QueueRecoveryService } from '../services/queue-recovery-service.js';
import { QueueStatusService } from '../services/queue-status-service.js';
import { ApiError, sendApiError } from '../shared/errors.js';
import { createRequestId } from '../shared/ids.js';
import { createLogger, type AppLogger } from '../shared/logger.js';

export interface ApplicationOptions {
  readonly envOverrides?: Record<string, string | undefined>;
  readonly env?: AppEnv;
  readonly logger?: AppLogger;
  readonly playerAdapter?: PlayerAdapter;
  readonly textToSpeechClient?: TextToSpeechClient;
  readonly overflowStore?: OverflowStore;
}

export interface ApplicationContext {
  readonly app: Express;
  readonly env: AppEnv;
  readonly logger: AppLogger;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly services: {
    readonly overflowStore: OverflowStore;
    readonly orchestrator: AlertOrchestrator;
    readonly queueAdmissionService: QueueAdmissionService;
    readonly queueRecoveryService: QueueRecoveryService;
    readonly queueStatusService: QueueStatusService;
  };
}

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const env = options.env ?? loadEnv(options.envOverrides);
  const logger = options.logger ?? createLogger(env.LOG_LEVEL);
  const queueConfig = createQueueConfig(env);
  const overflowStore = options.overflowStore ?? new OverflowStore(env.QUEUE_DB_PATH, logger);
  await overflowStore.initialize();
  const playerAdapter = options.playerAdapter ?? (await createPlayerAdapter(env));
  const textToSpeechClient = options.textToSpeechClient ?? new ElevenLabsClient(env, logger);

  const orchestrator = new AlertOrchestrator({
    queueConfig,
    overflowStore,
    textToSpeechClient,
    playerAdapter,
    logger
  });
  const queueRecoveryService = new QueueRecoveryService(overflowStore, orchestrator, logger);
  const recoveryStatus = await queueRecoveryService.recover();
  const queueAdmissionService = new QueueAdmissionService({
    queueConfig,
    orchestrator,
    overflowStore,
    queueRecoveryService,
    playerAdapter,
    logger,
    initialSequenceNumber: recoveryStatus.highestSequenceNumber
  });
  const queueStatusService = new QueueStatusService(
    orchestrator,
    overflowStore,
    queueAdmissionService,
    queueRecoveryService,
    playerAdapter,
    queueConfig.recentFailureLimit
  );

  const app = express();
  let stopping = false;
  app.use(express.json({ limit: '256kb' }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = createRequestId();
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (stopping && request.method === 'POST' && request.path === '/api/v1/alerts') {
      sendApiError(
        response,
        new ApiError(503, 'QUEUE_SHUTTING_DOWN', 'Alert intake is stopping because the service is shutting down.', response.locals.requestId)
      );
      return;
    }

    next();
  });

  app.use(buildHealthRoute(queueStatusService));
  app.use(buildAlertsRoute(queueAdmissionService, logger));
  app.use(buildQueueStatusRoute(queueStatusService));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    logger.error({ error }, 'Unhandled application error.');
    response.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unhandled application error.',
        requestId: response.locals.requestId
      }
    });
  });

  let server: Server | null = null;

  return {
    app,
    env,
    logger,
    start: async () => {
      if (server) {
        return;
      }

      await new Promise<void>((resolve) => {
        server = createServer(app);
        server.listen(env.PORT, env.HOST, () => {
          logger.info({ host: env.HOST, port: env.PORT }, 'Alert queue service started.');
          resolve();
        });
      });
    },
    stop: async () => {
      stopping = true;
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server?.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        server = null;
      }
      await orchestrator.prepareForShutdown();
      await overflowStore.dispose();
    },
    services: {
      overflowStore,
      orchestrator,
      queueAdmissionService,
      queueRecoveryService,
      queueStatusService
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const application = await createApplication();
  await application.start();
}
