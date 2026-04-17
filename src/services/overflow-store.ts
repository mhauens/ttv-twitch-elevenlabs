import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { AlertQueueItem } from '../domain/alert-queue-item.js';
import type { FailureSummary, RecoveryFailureRecord } from '../domain/recovery-failure-record.js';
import type { AppLogger } from '../shared/logger.js';

interface DeferredOverflowRow {
  readonly job_id: string;
  readonly request_id: string;
  readonly correlation_id: string;
  readonly source: string;
  readonly dedupe_key: string | null;
  readonly received_at: string;
  readonly alert_type: string;
  readonly payload_json: string;
  readonly state: string;
  readonly storage_tier: string;
  readonly sequence_number: number;
  readonly admission_outcome: string;
  readonly enqueued_at: string;
}

interface FailureRow {
  readonly job_id: string;
  readonly request_id: string;
  readonly failure_code: string;
  readonly failure_reason: string;
  readonly failed_at: string;
  readonly recovery_failure: number;
}

export class OverflowStore {
  private readonly dbPath: string;
  private readonly logger: AppLogger;
  private db: Database.Database | null = null;

  public constructor(dbPath: string, logger: AppLogger) {
    this.dbPath = dbPath;
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS deferred_overflow (
        record_id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL UNIQUE,
        request_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        source TEXT NOT NULL,
        dedupe_key TEXT,
        received_at TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL,
        storage_tier TEXT NOT NULL,
        sequence_number INTEGER NOT NULL UNIQUE,
        admission_outcome TEXT NOT NULL,
        enqueued_at TEXT NOT NULL,
        persisted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS failure_records (
        failure_id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        correlation_id TEXT,
        failure_code TEXT NOT NULL,
        failure_reason TEXT NOT NULL,
        failed_at TEXT NOT NULL,
        recovery_failure INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS runtime_state (
        state_key TEXT PRIMARY KEY,
        state_value TEXT NOT NULL
      );
    `);
  }

  public isReady(): boolean {
    return this.db !== null;
  }

  public async persistDeferred(item: AlertQueueItem): Promise<void> {
    this.database
      .prepare(
        `
        INSERT OR REPLACE INTO deferred_overflow (
          job_id,
          request_id,
          correlation_id,
          source,
          dedupe_key,
          received_at,
          alert_type,
          payload_json,
          state,
          storage_tier,
          sequence_number,
          admission_outcome,
          enqueued_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        item.jobId,
        item.requestId,
        item.correlationId,
        item.source,
        item.dedupeKey ?? null,
        item.receivedAt,
        item.alertType,
        JSON.stringify(item.payload),
        item.state,
        item.storageTier,
        item.sequenceNumber,
        item.admissionOutcome,
        item.enqueuedAt
      );

    await this.saveLastSequenceNumber(item.sequenceNumber);
  }

  public async restoreDeferredItems(limit?: number): Promise<AlertQueueItem[]> {
    const rows = this.readDeferredRows(limit);
    if (rows.length === 0) {
      return [];
    }

    const claimRow = this.database.prepare(
      `
      UPDATE deferred_overflow
      SET state = 'restored-pending', storage_tier = 'memory'
      WHERE job_id = ?
    `
    );
    const claimRows = this.database.transaction((jobIds: string[]) => {
      for (const jobId of jobIds) {
        claimRow.run(jobId);
      }
    });
    claimRows(rows.map((row) => row.job_id));

    return rows.map((row) => this.mapDeferredRow(row));
  }

  public async getDeferredDepth(): Promise<number> {
    const row = this.database
      .prepare<[], { count: number }>("SELECT COUNT(*) as count FROM deferred_overflow WHERE state = 'deferred-overflow'")
      .get();
    return row?.count ?? 0;
  }

  public async recordFailure(summary: FailureSummary, correlationId?: string): Promise<void> {
    this.database
      .prepare(
        `
        INSERT INTO failure_records (
          job_id,
          request_id,
          correlation_id,
          failure_code,
          failure_reason,
          failed_at,
          recovery_failure
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        summary.jobId,
        summary.requestId,
        correlationId ?? null,
        summary.failureCode,
        summary.failureReason,
        summary.failedAt,
        summary.recoveryFailure ? 1 : 0
      );
  }

  public async recordRecoveryFailure(record: RecoveryFailureRecord): Promise<void> {
    await this.recordFailure(
      {
        jobId: record.jobId,
        requestId: record.requestId,
        failureCode: record.failureCode,
        failureReason: record.failureReason,
        failedAt: record.failedAt,
        recoveryFailure: true
      },
      record.correlationId
    );
  }

  public async listRecentFailures(limit: number): Promise<FailureSummary[]> {
    const rows = this.database
      .prepare<[number], FailureRow>(
        `
        SELECT job_id, request_id, failure_code, failure_reason, failed_at, recovery_failure
        FROM failure_records
        ORDER BY datetime(failed_at) DESC, failure_id DESC
        LIMIT ?
      `
      )
      .all(limit);

    return rows.map((row) => ({
      jobId: row.job_id,
      requestId: row.request_id,
      failureCode: row.failure_code,
      failureReason: row.failure_reason,
      failedAt: row.failed_at,
      recoveryFailure: row.recovery_failure === 1
    }));
  }

  public async writeActiveJob(item: AlertQueueItem): Promise<void> {
    const writeActiveJob = this.database.prepare(
      `
      INSERT INTO runtime_state (state_key, state_value)
      VALUES ('active_job', ?)
      ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value
    `
    );
    const saveLastSequenceNumber = this.database.prepare(
      `
      INSERT INTO runtime_state (state_key, state_value)
      VALUES ('last_sequence_number', ?)
      ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value
    `
    );
    const removeDeferredRow = this.database.prepare('DELETE FROM deferred_overflow WHERE job_id = ?');
    this.database.transaction(() => {
      writeActiveJob.run(JSON.stringify(item));
      saveLastSequenceNumber.run(String(item.sequenceNumber));
      removeDeferredRow.run(item.jobId);
    })();
  }

  public async clearActiveJob(): Promise<void> {
    this.database.prepare("DELETE FROM runtime_state WHERE state_key = 'active_job'").run();
  }

  public async getActiveJob(): Promise<AlertQueueItem | null> {
    const row = this.database
      .prepare<[], { state_value: string }>("SELECT state_value FROM runtime_state WHERE state_key = 'active_job'")
      .get();

    if (!row) {
      return null;
    }

    return JSON.parse(row.state_value) as AlertQueueItem;
  }

  public async saveLastSequenceNumber(sequenceNumber: number): Promise<void> {
    this.database
      .prepare(
        `
        INSERT INTO runtime_state (state_key, state_value)
        VALUES ('last_sequence_number', ?)
        ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value
      `
      )
      .run(String(sequenceNumber));
  }

  public async resetRestoredPendingItems(): Promise<void> {
    this.database
      .prepare(
        `
        UPDATE deferred_overflow
        SET state = 'deferred-overflow', storage_tier = 'deferred-overflow'
        WHERE state = 'restored-pending'
      `
      )
      .run();
  }

  public async getMaxSequenceNumber(): Promise<number> {
    const runtimeRow = this.database
      .prepare<[], { state_value: string }>("SELECT state_value FROM runtime_state WHERE state_key = 'last_sequence_number'")
      .get();
    const deferredRow = this.database
      .prepare<[], { value: number }>('SELECT COALESCE(MAX(sequence_number), 0) as value FROM deferred_overflow')
      .get();
    const activeJob = await this.getActiveJob();

    return Math.max(
      Number.parseInt(runtimeRow?.state_value ?? '0', 10),
      deferredRow?.value ?? 0,
      activeJob?.sequenceNumber ?? 0
    );
  }

  public async dispose(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private get database(): Database.Database {
    if (!this.db) {
      throw new Error('OverflowStore is not initialized.');
    }

    return this.db;
  }

  private readDeferredRows(limit?: number): DeferredOverflowRow[] {
    if (limit === undefined) {
      return this.database
        .prepare<[], DeferredOverflowRow>("SELECT * FROM deferred_overflow WHERE state = 'deferred-overflow' ORDER BY sequence_number ASC")
        .all();
    }

    return this.database
      .prepare<[number], DeferredOverflowRow>(
        "SELECT * FROM deferred_overflow WHERE state = 'deferred-overflow' ORDER BY sequence_number ASC LIMIT ?"
      )
      .all(limit);
  }

  private mapDeferredRow(row: DeferredOverflowRow): AlertQueueItem {
    this.logger.debug({ jobId: row.job_id, sequenceNumber: row.sequence_number }, 'Restoring deferred overflow item.');

    return {
      jobId: row.job_id,
      requestId: row.request_id,
      correlationId: row.correlation_id,
      source: row.source as AlertQueueItem['source'],
      dedupeKey: row.dedupe_key ?? undefined,
      receivedAt: row.received_at,
      alertType: row.alert_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      state: 'restored-pending',
      storageTier: 'memory',
      sequenceNumber: row.sequence_number,
      admissionOutcome: row.admission_outcome as AlertQueueItem['admissionOutcome'],
      enqueuedAt: row.enqueued_at
    };
  }
}
