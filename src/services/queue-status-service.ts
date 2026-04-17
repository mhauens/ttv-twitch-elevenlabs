import type { HealthSnapshot, QueueSnapshot } from '../domain/queue-snapshot.js';
import type { PlayerAdapter } from '../playback/player-adapter.js';
import type { AlertOrchestrator } from './alert-orchestrator.js';
import type { OverflowStore } from './overflow-store.js';
import type { QueueAdmissionService } from './queue-admission-service.js';
import type { QueueRecoveryService } from './queue-recovery-service.js';
import { nowIso } from '../shared/time.js';

export class QueueStatusService {
  private readonly orchestrator: AlertOrchestrator;
  private readonly overflowStore: OverflowStore;
  private readonly admissionService: QueueAdmissionService;
  private readonly recoveryService: QueueRecoveryService;
  private readonly playerAdapter: PlayerAdapter;
  private readonly recentFailureLimit: number;

  public constructor(
    orchestrator: AlertOrchestrator,
    overflowStore: OverflowStore,
    admissionService: QueueAdmissionService,
    recoveryService: QueueRecoveryService,
    playerAdapter: PlayerAdapter,
    recentFailureLimit: number
  ) {
    this.orchestrator = orchestrator;
    this.overflowStore = overflowStore;
    this.admissionService = admissionService;
    this.recoveryService = recoveryService;
    this.playerAdapter = playerAdapter;
    this.recentFailureLimit = recentFailureLimit;
  }

  public async getQueueSnapshot(): Promise<QueueSnapshot> {
    return {
      activeJob: this.orchestrator.getActiveSummary(),
      inMemoryDepth: this.orchestrator.getPendingDepth(),
      deferredDepth: await this.overflowStore.getDeferredDepth(),
      oldestPendingAgeMs: this.orchestrator.getOldestPendingAgeMs(),
      recentFailures: await this.overflowStore.listRecentFailures(this.recentFailureLimit),
      recentRejections: this.admissionService.getRecentRejections(),
      lastUpdatedAt: nowIso()
    };
  }

  public async getHealthSnapshot(): Promise<HealthSnapshot> {
    const playerReady = await this.playerAdapter.ensureAvailable();
    const recoveryStatus = this.recoveryService.getStatus();
    const queuePersistenceReady = this.overflowStore.isReady() && recoveryStatus.ready;

    return {
      ready: queuePersistenceReady && playerReady,
      queuePersistenceReady,
      playerReady,
      configurationValid: true,
      recoveryMessage: recoveryStatus.message
    };
  }
}