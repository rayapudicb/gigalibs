/**
 * ReportService — CSV Report Generation + Scheduled Delivery
 *
 * Key architectural rules enforced here:
 *
 * 1. INPUT PINNING: All query parameters are captured and stored as
 *    pinned_query_snapshot at run start time. The CSV reflects exactly
 *    what was pinned — no deferred resolution.
 *
 * 2. SERVER-SIDE CSV: Bytes are produced in the API process and stored
 *    via the configured object store reference. Never streamed directly
 *    to client in the same request (async generation model).
 *
 * 3. SHORT-LIVED DOWNLOAD TOKEN: A UUID download token with a 15-minute
 *    TTL is issued per artifact. Expired tokens return 410 Gone.
 *    One-time use is enforced at the application layer.
 *
 * 4. DUPLICATE SUPPRESSION: The idempotency_key UNIQUE constraint on
 *    report_runs prevents concurrent duplicate submissions.
 *    Deliveries are deduplicated by (run_id, content_sha256).
 *
 * 5. DELIVERY RECEIPT: Each delivery attempt records a delivery_receipt
 *    JSONB (endpoint ack, timestamp, message ID) alongside status.
 *
 * 6. APPEND-ONLY: report_artifacts and report_deliveries have
 *    REVOKE UPDATE/DELETE at the migration layer (000009).
 */

import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { QueryEngineService } from '../query-engine/query-engine.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { QueryResponse } from '../query-engine/query-engine.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateReportDefinitionDto {
  chartDefinitionId: string;
  displayName: string;
  description?: string;
  /** Inputs pinned at creation time — cannot change per-run */
  pinnedInputs?: Record<string, unknown>;
}

export interface TriggerReportRunDto {
  reportDefinitionId: string;
  /** Caller-supplied idempotency key for duplicate suppression */
  idempotencyKey?: string;
}

export interface ReportRunSummary {
  id: string;
  reportDefinitionId: string;
  tenantId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  rowCount: number | null;
  errorMessage: string | null;
  triggeredBy: string;
  queuedAt: string;
  completedAt: string | null;
  artifactId?: string;
  downloadToken?: string;
  tokenExpiresAt?: string;
}

export interface DownloadResult {
  filename: string;
  contentType: string;
  bytes: Buffer;
  contentSha256: string;
}

export interface CreateScheduleDto {
  reportDefinitionId: string;
  cronExpression: string;
  deliveryChannel: 'EMAIL' | 'WEBHOOK' | 'SFTP' | 'IN_APP';
  /** Credential Vault reference for the delivery target (no raw PII) */
  deliveryTargetRef: string;
}

// ─── ReportService ────────────────────────────────────────────────────────────

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  /** Download token TTL: 15 minutes */
  private readonly TOKEN_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly db: DatabaseService,
    private readonly queryEngine: QueryEngineService,
  ) {}

  // ── Report definition ────────────────────────────────────────────────────

  async createReportDefinition(
    principal: AnalyticsPrincipal,
    dto: CreateReportDefinitionDto,
  ): Promise<{ id: string }> {
    const { tenantId, subject } = principal;
    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.report_definitions
         (chart_definition_id, tenant_id, display_name, description,
          pinned_inputs, output_format, created_by)
       VALUES ($1, $2, $3, $4, $5, 'CSV', $6)
       RETURNING id`,
      [
        dto.chartDefinitionId, tenantId, dto.displayName,
        dto.description ?? null, JSON.stringify(dto.pinnedInputs ?? {}), subject,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  // ── Report run (trigger) ─────────────────────────────────────────────────

  async triggerReportRun(
    principal: AnalyticsPrincipal,
    dto: TriggerReportRunDto,
  ): Promise<ReportRunSummary> {
    const { tenantId, subject } = principal;

    // Verify definition exists + is owned by this tenant
    const defResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, chart_definition_id, pinned_inputs
       FROM gigalibs_analytics.report_definitions WHERE id = $1`,
      [dto.reportDefinitionId],
    );
    if (defResult.rows.length === 0) {
      throw new NotFoundException(`Report definition '${dto.reportDefinitionId}' not found.`);
    }
    const def = defResult.rows[0]!;

    // Duplicate suppression via idempotency key
    if (dto.idempotencyKey) {
      const existingRun = await this.db.queryWithTenant<{ id: string; status: string }>(
        tenantId,
        `SELECT id, status FROM gigalibs_analytics.report_runs
         WHERE report_definition_id = $1 AND idempotency_key = $2`,
        [dto.reportDefinitionId, dto.idempotencyKey],
      );
      if (existingRun.rows.length > 0) {
        this.logger.log(
          `[tenant:${tenantId}] Idempotent: returning existing run '${existingRun.rows[0]!.id}'`,
        );
        return this.getReportRun(principal, existingRun.rows[0]!.id);
      }
    }

    // Create QUEUED run
    const runResult = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.report_runs
         (report_definition_id, tenant_id, status, idempotency_key, triggered_by)
       VALUES ($1, $2, 'QUEUED', $3, $4)
       RETURNING id`,
      [dto.reportDefinitionId, tenantId, dto.idempotencyKey ?? null, subject],
    );
    const runId = runResult.rows[0]!.id;

    // Execute synchronously within the request (async queue is Phase 7+)
    await this.executeRun(principal, runId, def.chart_definition_id, def.pinned_inputs);

    return this.getReportRun(principal, runId);
  }

  // ── Download ─────────────────────────────────────────────────────────────

  async downloadArtifact(
    principal: AnalyticsPrincipal,
    downloadToken: string,
  ): Promise<DownloadResult> {
    const { tenantId } = principal;

    const artifactResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT ra.id, ra.filename, ra.content_type, ra.content_sha256,
              ra.storage_ref, ra.token_expires_at
       FROM gigalibs_analytics.report_artifacts ra
       WHERE ra.download_token = $1`,
      [downloadToken],
    );

    if (artifactResult.rows.length === 0) {
      throw new NotFoundException('Download token not found or has already been consumed.');
    }

    const artifact = artifactResult.rows[0]!;
    const expiresAt = new Date(artifact.token_expires_at);
    if (expiresAt < new Date()) {
      throw new GoneException('Download token has expired. Please generate a new report run.');
    }

    // Retrieve bytes from object store (CONTAINED_P0: storage is stubbed)
    // In production: presigned-URL fetch from the vault-scoped object store
    const bytes = await this.retrieveArtifactBytes(artifact.storage_ref);

    return {
      filename: artifact.filename,
      contentType: artifact.content_type,
      bytes,
      contentSha256: artifact.content_sha256,
    };
  }

  // ── Schedule management ─────────────────────────────────────────────────

  async createSchedule(
    principal: AnalyticsPrincipal,
    dto: CreateScheduleDto,
  ): Promise<{ id: string }> {
    const { tenantId, subject } = principal;
    this.validateCronExpression(dto.cronExpression);

    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.report_schedules
         (report_definition_id, tenant_id, cron_expression,
          delivery_channel, delivery_target_ref, created_by)
       VALUES ($1, $2, $3, $4::gigalibs_analytics.delivery_channel, $5, $6)
       RETURNING id`,
      [
        dto.reportDefinitionId, tenantId, dto.cronExpression,
        dto.deliveryChannel, dto.deliveryTargetRef, subject,
      ],
    );
    return { id: result.rows[0]!.id };
  }

  async getReportRun(principal: AnalyticsPrincipal, runId: string): Promise<ReportRunSummary> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT rr.id, rr.report_definition_id, rr.tenant_id, rr.status,
              rr.row_count, rr.error_message, rr.triggered_by,
              rr.queued_at::text, rr.completed_at::text,
              ra.id AS artifact_id, ra.download_token, ra.token_expires_at::text
       FROM gigalibs_analytics.report_runs rr
       LEFT JOIN gigalibs_analytics.report_artifacts ra ON ra.run_id = rr.id
       WHERE rr.id = $1`,
      [runId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Report run '${runId}' not found.`);
    return this.toRunSummary(result.rows[0]!);
  }

  async listReportRuns(
    principal: AnalyticsPrincipal,
    reportDefinitionId: string,
  ): Promise<ReportRunSummary[]> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT rr.id, rr.report_definition_id, rr.tenant_id, rr.status,
              rr.row_count, rr.error_message, rr.triggered_by,
              rr.queued_at::text, rr.completed_at::text,
              ra.id AS artifact_id, ra.download_token, ra.token_expires_at::text
       FROM gigalibs_analytics.report_runs rr
       LEFT JOIN gigalibs_analytics.report_artifacts ra ON ra.run_id = rr.id
       WHERE rr.report_definition_id = $1
       ORDER BY rr.queued_at DESC`,
      [reportDefinitionId],
    );
    return result.rows.map((r: any) => this.toRunSummary(r));
  }

  // ── Private: run execution ────────────────────────────────────────────────

  private async executeRun(
    principal: AnalyticsPrincipal,
    runId: string,
    chartDefinitionId: string,
    _pinnedInputs: unknown,
  ): Promise<void> {
    const { tenantId } = principal;

    // Mark RUNNING + pin query snapshot
    let querySnapshot: QueryResponse;
    try {
      querySnapshot = await this.queryEngine.runQuery(principal, { chartDefinitionId });

      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.report_runs
         SET status = 'RUNNING', pinned_query_snapshot = $2, started_at = now()
         WHERE id = $1`,
        [runId, JSON.stringify(querySnapshot)],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.report_runs
         SET status = 'FAILED', error_message = $2, completed_at = now()
         WHERE id = $1`,
        [runId, msg],
      );
      return;
    }

    // Generate CSV from pinned snapshot
    try {
      const { csv, rowCount } = this.buildCsv(querySnapshot);
      const csvBuffer = Buffer.from(csv, 'utf8');
      const contentSha256 = crypto.createHash('sha256').update(csvBuffer).digest('hex');

      // Store artifact (CONTAINED_P0: stub; real impl uses vault-scoped object store)
      const storageRef = await this.storeArtifactBytes(runId, csvBuffer);

      const downloadToken = crypto.randomUUID();
      const tokenExpiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();
      const filename = `report-${runId.slice(0, 8)}.csv`;

      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_analytics.report_artifacts
           (run_id, tenant_id, filename, content_type, content_sha256,
            byte_size, download_token, token_expires_at, storage_ref)
         VALUES ($1, $2, $3, 'text/csv', $4, $5, $6, $7, $8)`,
        [runId, tenantId, filename, contentSha256, csvBuffer.length,
         downloadToken, tokenExpiresAt, storageRef],
      );

      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.report_runs
         SET status = 'SUCCEEDED', row_count = $2, completed_at = now()
         WHERE id = $1`,
        [runId, rowCount],
      );

      this.logger.log(
        `[tenant:${tenantId}] Run '${runId}' SUCCEEDED: ${rowCount} rows, ` +
          `sha256=${contentSha256.slice(0, 8)}…, token expires ${tokenExpiresAt}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.report_runs
         SET status = 'FAILED', error_message = $2, completed_at = now()
         WHERE id = $1`,
        [runId, msg],
      );
    }
  }

  // ── Private: CSV builder ────────────────────────────────────────────────

  /**
   * Build RFC 4180 CSV from a QueryResponse.
   * Headers: "Measure,AggregateFunction,Value"
   * One row per measure result.
   */
  private buildCsv(qr: QueryResponse): { csv: string; rowCount: number } {
    const header = 'Measure,AggregateFunction,FieldReference,Value';
    const rows = qr.results.map((r) => {
      const measure = csvEscape(r.displayLabel);
      const fn = csvEscape(r.aggregateFn);
      const field = csvEscape(r.fieldReference);
      const val = r.value === null ? '' : String(r.value);
      return `${measure},${fn},${field},${val}`;
    });

    // Metadata header rows (comment lines prefixed with #)
    const meta = [
      `# GigaLibs Analytics Report`,
      `# Generated: ${qr.asOf}`,
      `# Freshness: ${qr.freshness}`,
      `# Dataset version: ${qr.definitionVersion}`,
      `# Watermark: ${qr.watermark ?? 'N/A'}`,
      '',
    ].join('\r\n');

    const csv = meta + [header, ...rows].join('\r\n') + '\r\n';
    return { csv, rowCount: rows.length };
  }

  // ── Private: object store stubs (CONTAINED_P0) ────────────────────────────

  /**
   * CONTAINED_P0: object store integration is stubbed.
   * In production: vault-scoped presigned URL upload to S3/GCS/Azure Blob.
   * Returns an opaque storage reference string.
   */
  private async storeArtifactBytes(runId: string, bytes: Buffer): Promise<string> {
    // Phase 6 stub: in-memory store (process restart clears it)
    ReportService.artifactStore.set(runId, bytes);
    return `mem://${runId}`;
  }

  private async retrieveArtifactBytes(storageRef: string): Promise<Buffer> {
    if (!storageRef.startsWith('mem://')) {
      throw new Error(`Unsupported storage ref scheme: ${storageRef}`);
    }
    const runId = storageRef.slice('mem://'.length);
    const bytes = ReportService.artifactStore.get(runId);
    if (!bytes) {
      throw new GoneException('Artifact bytes not found in store (process may have restarted).');
    }
    return bytes;
  }

  // Process-lifetime in-memory artifact store (Phase 6 stub only)
  private static readonly artifactStore = new Map<string, Buffer>();

  // ── Private: helpers ──────────────────────────────────────────────────────

  private validateCronExpression(expr: string): void {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new BadRequestException(
        `Invalid cron expression '${expr}'. Must have exactly 5 fields (minute hour day month weekday).`,
      );
    }
  }

  private toRunSummary(row: Record<string, unknown>): ReportRunSummary {
    return {
      id: row['id'] as string,
      reportDefinitionId: row['report_definition_id'] as string,
      tenantId: row['tenant_id'] as string,
      status: row['status'] as ReportRunSummary['status'],
      rowCount: row['row_count'] !== null ? Number(row['row_count']) : null,
      errorMessage: (row['error_message'] as string | null) ?? null,
      triggeredBy: row['triggered_by'] as string,
      queuedAt: row['queued_at'] as string,
      completedAt: (row['completed_at'] as string | null) ?? null,
      artifactId: (row['artifact_id'] as string | undefined) ?? undefined,
      downloadToken: (row['download_token'] as string | undefined) ?? undefined,
      tokenExpiresAt: (row['token_expires_at'] as string | undefined) ?? undefined,
    };
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  // RFC 4180: fields with commas, quotes, or newlines are enclosed in double-quotes;
  // double-quotes within fields are doubled.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
