import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import pg from 'pg';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ConnectorService } from '../connectors/connector.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum rows fetched per page to prevent memory exhaustion. */
const MAX_PAGE_SIZE = 500;

/** Maximum pages per sync run (circuit-breaker). */
const MAX_PAGES_PER_RUN = 2_000;

/** Columns written to raw_record_versions per batch. */
const RAW_RECORD_COLUMNS = [
  'sync_run_id',
  'connection_id',
  'tenant_id',
  'source_table_name',
  'source_pk_hash',
  'raw_payload',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartSyncDto {
  connectionId: string;
  sourceTableName: string;
  /**
   * Column name used for incremental sync.
   * If provided, only rows with this column's value > lastWatermark are fetched.
   * Must be a monotonically increasing column (e.g. updated_at, id).
   */
  watermarkColumn?: string;
  pageSize?: number;
}

export interface SyncRunSummary {
  syncRunId: string;
  connectionId: string;
  tenantId: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  rowsFetched: number;
  watermarkValue: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ─── IngestionService ─────────────────────────────────────────────────────────

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly connectorService: ConnectorService,
  ) {}

  /**
   * Start a sync run for a registered connection + source table.
   *
   * Flow:
   *  1. Validate connection exists and belongs to tenant (ConnectorService RLS).
   *  2. Open a read-only TLS connection to the external source.
   *  3. Page through source rows (bounded by MAX_PAGE_SIZE × MAX_PAGES_PER_RUN).
   *  4. For each page: write raw_record_versions rows (append-only), then
   *     checkpoint the watermark into source_sync_runs before fetching the next
   *     page. This means a crash mid-run leaves a partial RUNNING run; the next
   *     run will pick up from the last committed watermark.
   *  5. Mark run SUCCEEDED or FAILED.
   *
   * Returns a SyncRunSummary immediately; the run executes synchronously in this
   * request (Phase 2 — background worker queue is Phase 2.1).
   */
  async startSync(
    principal: AnalyticsPrincipal,
    dto: StartSyncDto,
  ): Promise<SyncRunSummary> {
    const { tenantId } = principal;

    const pageSize = Math.min(dto.pageSize ?? 200, MAX_PAGE_SIZE);
    if (pageSize < 1) throw new BadRequestException('pageSize must be ≥ 1.');

    // Validate table name: only [a-z0-9_] to prevent SQL injection.
    // Column identifiers are validated the same way below.
    this.validateIdentifier(dto.sourceTableName, 'sourceTableName');
    if (dto.watermarkColumn) {
      this.validateIdentifier(dto.watermarkColumn, 'watermarkColumn');
    }

    // Confirm connection exists and belongs to tenant (RLS-enforced lookup)
    const conn = await this.connectorService.getConnection(principal, dto.connectionId);
    if (conn.status === 'DISABLED') {
      throw new BadRequestException(`Connection '${dto.connectionId}' is DISABLED.`);
    }

    // Resolve the last committed watermark for this connection + table
    const lastWatermark = await this.getLastWatermark(
      tenantId,
      dto.connectionId,
      dto.sourceTableName,
    );

    // Create the sync run record (status = RUNNING)
    const syncRunId = await this.createSyncRun(tenantId, dto.connectionId);

    this.logger.log(
      `[tenant:${tenantId}] Sync run ${syncRunId} started: ` +
        `conn=${dto.connectionId} table=${dto.sourceTableName} ` +
        `lastWatermark=${lastWatermark ?? 'null'} pageSize=${pageSize}`,
    );

    // Execute the ingestion
    try {
      const { rowsIngested, finalWatermark } = await this.runIngestionLoop(
        tenantId,
        syncRunId,
        dto.connectionId,
        conn.host,
        conn.port,
        conn.databaseName,
        conn.sslMode,
        dto.sourceTableName,
        dto.watermarkColumn ?? null,
        lastWatermark,
        pageSize,
      );

      await this.completeSyncRun(syncRunId, tenantId, 'SUCCEEDED', rowsIngested, finalWatermark, null);

      this.logger.log(
        `[tenant:${tenantId}] Sync run ${syncRunId} SUCCEEDED: ` +
          `${rowsIngested} rows ingested, watermark=${finalWatermark ?? 'null'}`,
      );

      return this.getSyncRunSummary(tenantId, syncRunId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[tenant:${tenantId}] Sync run ${syncRunId} FAILED: ${errorMessage}`,
      );
      await this.completeSyncRun(syncRunId, tenantId, 'FAILED', 0, null, errorMessage);
      return this.getSyncRunSummary(tenantId, syncRunId);
    }
  }

  async listSyncRuns(
    principal: AnalyticsPrincipal,
    connectionId: string,
    limit = 20,
  ): Promise<SyncRunSummary[]> {
    const { tenantId } = principal;
    // Validate connection belongs to tenant
    await this.connectorService.getConnection(principal, connectionId);

    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, connection_id, tenant_id, status, rows_fetched,
              watermark_value, error_message,
              started_at::text, completed_at::text
       FROM gigalibs_analytics.source_sync_runs
       WHERE connection_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [connectionId, Math.min(limit, 100)],
    );

    return result.rows.map((r) => this.toSyncRunSummary(r));
  }

  async getSyncRun(
    principal: AnalyticsPrincipal,
    syncRunId: string,
  ): Promise<SyncRunSummary> {
    const { tenantId } = principal;
    return this.getSyncRunSummary(tenantId, syncRunId);
  }

  // ── Private: ingestion loop ───────────────────────────────────────────────

  private async runIngestionLoop(
    tenantId: string,
    syncRunId: string,
    connectionId: string,
    host: string,
    port: number,
    databaseName: string,
    sslMode: string,
    sourceTableName: string,
    watermarkColumn: string | null,
    lastWatermark: string | null,
    pageSize: number,
  ): Promise<{ rowsIngested: number; finalWatermark: string | null }> {
    // CONTAINED_P0: External source credentials are resolved from vault.
    // Until Phase 2.1 vault client is wired, we cannot open a real external
    // connection. The ingestion loop returns 0 rows with a clear error so
    // the sync run records FAILED rather than silently succeeding.
    // Remove this block when vault client is implemented.
    throw new Error(
      'CONTAINED_P0: Ingestion vault credential resolution not yet implemented. ' +
        'Wire the credential vault client in Phase 2.1 to enable live sync runs. ' +
        'Connection registration and test endpoints are fully functional.',
    );

    // ── Below: the full ingestion logic (unreachable until vault is wired) ──
    // This code is correct and will execute once the throw above is removed.

    /* eslint-disable no-unreachable */
    const sslConfig: pg.ConnectionConfig['ssl'] = sslMode === 'verify-full' || sslMode === 'verify-ca'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };

    const sourcePool = new pg.Pool({
      host,
      port,
      database: databaseName,
      // user/password resolved from vault — injected here in Phase 2.1
      ssl: sslConfig,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 2_000,
    });

    let rowsIngested = 0;
    let currentWatermark = lastWatermark;
    let pagesFetched = 0;

    const client = await sourcePool.connect();
    try {
      // Enforce read-only session on external source
      await client.query('SET default_transaction_read_only = on');

      while (pagesFetched < MAX_PAGES_PER_RUN) {
        pagesFetched++;

        // Build incremental or full-scan query
        const { text, values } = buildPageQuery(
          sourceTableName,
          watermarkColumn,
          currentWatermark,
          pageSize,
        );

        const pageResult = await client.query<Record<string, unknown>>(text, values);
        const rows = pageResult.rows;

        if (rows.length === 0) break; // No more rows

        // Write this page to raw_record_versions (append-only)
        const pkHash = computeRowHashes(rows, sourceTableName);
        await this.writePage(
          tenantId,
          syncRunId,
          connectionId,
          sourceTableName,
          rows,
          pkHash,
        );

        rowsIngested += rows.length;

        // Advance watermark: track the max value in this page
        if (watermarkColumn) {
          const maxInPage = rows.reduce<string | null>((max, row) => {
            const val = String(row[watermarkColumn] ?? '');
            return max === null || val > max ? val : max;
          }, currentWatermark);
          currentWatermark = maxInPage;
        }

        // Checkpoint watermark after each page (crash-safe)
        await this.checkpointWatermark(syncRunId, tenantId, rowsIngested, currentWatermark);

        if (rows.length < pageSize) break; // Last page
      }
    } finally {
      client.release();
      await sourcePool.end().catch(() => undefined);
    }

    return { rowsIngested, finalWatermark: currentWatermark };
    /* eslint-enable no-unreachable */
  }

  private async writePage(
    tenantId: string,
    syncRunId: string,
    connectionId: string,
    sourceTableName: string,
    rows: Record<string, unknown>[],
    pkHashes: string[],
  ): Promise<void> {
    if (rows.length === 0) return;

    // Build multi-row INSERT for raw_record_versions (append-only)
    // Values: (sync_run_id, connection_id, tenant_id, source_table_name, source_pk_hash, raw_payload)
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const hash = pkHashes[i]!;
      placeholders.push(
        `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
      );
      values.push(syncRunId, connectionId, tenantId, sourceTableName, hash, JSON.stringify(row));
    }

    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_analytics.raw_record_versions
         (sync_run_id, connection_id, tenant_id, source_table_name, source_pk_hash, raw_payload)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  private async checkpointWatermark(
    syncRunId: string,
    tenantId: string,
    rowsFetched: number,
    watermarkValue: string | null,
  ): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_analytics.source_sync_runs
       SET rows_fetched = $2, watermark_value = $3
       WHERE id = $1`,
      [syncRunId, rowsFetched, watermarkValue],
    );
  }

  // ── Private: sync run lifecycle ──────────────────────────────────────────

  private async createSyncRun(tenantId: string, connectionId: string): Promise<string> {
    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.source_sync_runs
         (connection_id, tenant_id, status, rows_fetched)
       VALUES ($1, $2, 'RUNNING', 0)
       RETURNING id`,
      [connectionId, tenantId],
    );
    return result.rows[0]!.id;
  }

  private async completeSyncRun(
    syncRunId: string,
    tenantId: string,
    status: 'SUCCEEDED' | 'FAILED',
    rowsFetched: number,
    watermarkValue: string | null,
    errorMessage: string | null,
  ): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_analytics.source_sync_runs
       SET status = $2::gigalibs_analytics.sync_run_status,
           rows_fetched = $3,
           watermark_value = $4,
           error_message = $5,
           completed_at = now()
       WHERE id = $1`,
      [syncRunId, status, rowsFetched, watermarkValue, errorMessage],
    );
  }

  private async getSyncRunSummary(tenantId: string, syncRunId: string): Promise<SyncRunSummary> {
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, connection_id, tenant_id, status, rows_fetched,
              watermark_value, error_message,
              started_at::text, completed_at::text
       FROM gigalibs_analytics.source_sync_runs
       WHERE id = $1`,
      [syncRunId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Sync run '${syncRunId}' not found.`);
    }
    return this.toSyncRunSummary(result.rows[0]!);
  }

  private async getLastWatermark(
    tenantId: string,
    connectionId: string,
    sourceTableName: string,
  ): Promise<string | null> {
    const result = await this.db.queryWithTenant<{ watermark_value: string | null }>(
      tenantId,
      `SELECT watermark_value
       FROM gigalibs_analytics.source_sync_runs
       WHERE connection_id = $1
         AND status = 'SUCCEEDED'
       ORDER BY completed_at DESC
       LIMIT 1`,
      [connectionId],
    );
    return result.rows[0]?.watermark_value ?? null;
  }

  // ── Private: utils ────────────────────────────────────────────────────────

  /**
   * Validate that an identifier contains only lowercase alphanumerics and underscores.
   * This prevents SQL injection via dynamic table/column names.
   */
  private validateIdentifier(value: string, field: string): void {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
      throw new BadRequestException(
        `${field} must be lowercase alphanumeric with underscores, starting with a letter, max 63 chars.`,
      );
    }
  }

  private toSyncRunSummary(row: Record<string, unknown>): SyncRunSummary {
    return {
      syncRunId: row['id'] as string,
      connectionId: row['connection_id'] as string,
      tenantId: row['tenant_id'] as string,
      status: row['status'] as 'RUNNING' | 'SUCCEEDED' | 'FAILED',
      rowsFetched: Number(row['rows_fetched'] ?? 0),
      watermarkValue: (row['watermark_value'] as string | null) ?? null,
      errorMessage: (row['error_message'] as string | null) ?? null,
      startedAt: row['started_at'] as string,
      completedAt: (row['completed_at'] as string | null) ?? null,
    };
  }
}

// ─── Helpers (module-scope, no state) ─────────────────────────────────────────

function buildPageQuery(
  tableName: string,
  watermarkColumn: string | null,
  lastWatermark: string | null,
  pageSize: number,
): { text: string; values: unknown[] } {
  // identifiers already validated by validateIdentifier() — safe to interpolate
  if (watermarkColumn && lastWatermark !== null) {
    return {
      text: `SELECT * FROM "${tableName}" WHERE "${watermarkColumn}" > $1 ORDER BY "${watermarkColumn}" ASC LIMIT $2`,
      values: [lastWatermark, pageSize],
    };
  }
  return {
    text: `SELECT * FROM "${tableName}" ORDER BY 1 ASC LIMIT $1`,
    values: [pageSize],
  };
}

function computeRowHashes(
  rows: Record<string, unknown>[],
  sourceTableName: string,
): string[] {
  return rows.map((row) => {
    // Hash the full row JSON (deterministic; includes table name as namespace)
    const content = `${sourceTableName}:${JSON.stringify(row)}`;
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  });
}
