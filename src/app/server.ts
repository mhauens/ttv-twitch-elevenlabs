import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';

import { createQueueConfig } from '../config/queue-config.js';
import { loadEnv, type AppEnv } from '../config/env.js';
import type { TextToSpeechClient } from '../integrations/text-to-speech-client.js';
import { createTextToSpeechClient } from '../integrations/tts-client-factory.js';
import type { WindowsSpeechRunner } from '../integrations/windows-tts-client.js';
import { createPlayerAdapter, type PlayerAdapter } from '../playback/player-adapter.js';
import { buildAlertsRoute } from '../routes/alerts-route.js';
import { buildHealthRoute } from '../routes/health-route.js';
import { buildQueueStatusRoute } from '../routes/queue-status-route.js';
import { buildStatusStreamRoute } from '../routes/status-stream-route.js';
import { AlertOrchestrator } from '../services/alert-orchestrator.js';
import { OverflowStore } from '../services/overflow-store.js';
import { QueueAdmissionService } from '../services/queue-admission-service.js';
import { QueueRecoveryService } from '../services/queue-recovery-service.js';
import { QueueStatusService } from '../services/queue-status-service.js';
import { StatusStreamService, type StatusStreamServiceOptions } from '../services/status-stream-service.js';
import { ApiError, sendApiError } from '../shared/errors.js';
import { createRequestId } from '../shared/ids.js';
import { createLogger, type AppLogger } from '../shared/logger.js';

export interface ApplicationOptions {
  readonly envOverrides?: Record<string, string | undefined>;
  readonly env?: AppEnv;
  readonly logger?: AppLogger;
  readonly playerAdapter?: PlayerAdapter;
  readonly textToSpeechClient?: TextToSpeechClient;
  readonly runtimePlatform?: NodeJS.Platform;
  readonly windowsSpeechRunner?: WindowsSpeechRunner;
  readonly ensureWindowsOutputDirectory?: (directoryPath: string) => Promise<void>;
  readonly removeWindowsOutputFile?: (filePath: string) => Promise<void>;
  readonly overflowStore?: OverflowStore;
  readonly statusStreamOptions?: Pick<StatusStreamServiceOptions, 'pollIntervalMs' | 'sseKeepaliveIntervalMs' | 'wsKeepaliveIntervalMs'>;
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
    readonly statusStreamService: StatusStreamService;
  };
}

export function resolveUpgradeRequestPath(requestUrl: string | undefined): string {
  if (!requestUrl) {
    return '';
  }

  try {
    return new URL(requestUrl, 'http://localhost').pathname;
  } catch {
    return '';
  }
}

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const env = options.env ?? loadEnv(options.envOverrides);
  const logger = options.logger ?? createLogger(env.LOG_LEVEL);
  const queueConfig = createQueueConfig(env);
  const textToSpeechClient =
    options.textToSpeechClient ??
    (await createTextToSpeechClient({
      env,
      logger,
      runtimePlatform: options.runtimePlatform,
      windowsSpeechRunner: options.windowsSpeechRunner,
      ensureWindowsOutputDirectory: options.ensureWindowsOutputDirectory,
      removeWindowsOutputFile: options.removeWindowsOutputFile
    }));
  const overflowStore = options.overflowStore ?? new OverflowStore(env.QUEUE_DB_PATH, logger);
  await overflowStore.initialize();
  const playerAdapter = options.playerAdapter ?? (await createPlayerAdapter(env));

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
  const statusStreamService = new StatusStreamService({
    queueStatusService,
    logger,
    ...options.statusStreamOptions
  });

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
  app.use(buildStatusStreamRoute(statusStreamService));
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
  let webSocketServer: WebSocketServer | null = null;

  return {
    app,
    env,
    logger,
    start: async () => {
      if (server) {
        return;
      }

      await statusStreamService.start({ applicationOwned: true });

      await new Promise<void>((resolve) => {
        server = createServer(app);
        webSocketServer = new WebSocketServer({ noServer: true });
        webSocketServer.on('connection', (socket: WebSocket) => {
          void statusStreamService.subscribeWebSocket(socket).catch((error: unknown) => {
            logger.warn({ error }, 'Closing WebSocket connection because the status stream is unavailable.');
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1011, 'Status stream unavailable');
            }
          });
        });
        server.on('upgrade', (request, socket, head) => {
          const requestPath = resolveUpgradeRequestPath(request.url);
          if (requestPath !== '/api/v1/status/ws' || !webSocketServer) {
            socket.destroy();
            return;
          }

          if (stopping) {
            socket.destroy();
            return;
          }

          webSocketServer.handleUpgrade(request, socket, head, (client: WebSocket) => {
            webSocketServer?.emit('connection', client, request);
          });
        });
        server.listen(env.PORT, env.HOST, () => {
          logger.info({ host: env.HOST, port: env.PORT }, 'Alert queue service started.');
          resolve();
        });
      });
    },
    stop: async () => {
      stopping = true;
      await statusStreamService.stop();
      if (webSocketServer) {
        await new Promise<void>((resolve) => {
          webSocketServer?.close(() => resolve());
        });
        webSocketServer = null;
      }
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
      queueStatusService,
      statusStreamService
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const application = await createApplication();
  await application.start();
}
