/**
 * ReportService — Analytics-owned CSV reports (WI-OI-103e, ADR-0016 F11)
 *
 * A report is a saved chart view or a dashboard exported as CSV. Rules enforced here:
 *
 * 1. QUESTIONS, NOT DATA: a definition stores its source only. Each run re-asks the stored question(s) with the
 *    caller's rights and pins the questions it asked (not the answers) in pinned_query_snapshot.
 * 2. DURABLE ARTIFACT: the CSV bytes are kept with the append-only artifact row, so a download survives a restart.
 * 3. SHORT-LIVED DOWNLOAD TOKEN: 15-minute TTL; expired tokens return 410 Gone. Downloading needs analytics:export.
 * 4. DUPLICATE SUPPRESSION: the idempotency key returns the existing run for the same definition.
 * 5. SPREADSHEET SAFETY: text cells that a spreadsheet would read as a formula (=, +, -, @, tab, CR) are prefixed
 *    with an apostrophe.
 * 6. SCHEDULES are stored but not executed until the scheduler (WI-OI-104); a scheduled run must use its owner's
 *    rights and check recipients at send time.
 */

import { BadRequestException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  type AnalyticsQueryResultV1,
  CreateReportV1Schema,
  type ReportRunV1,
  type ReportV1,
} from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { ChartViewService } from '../query-engine/chart-view.service.js';
import { DashboardService } from '../query-engine/dashboard.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerReportRunDto {
  reportDefinitionId: string;
  /** Caller-supplied idempotency key for duplicate suppression */
  idempotencyKey?: string;
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

interface DefinitionRow {
  id: string;
  display_name: string;
  description: string | null;
  chart_definition_id: string | null;
  chart_view_id: string | null;
  dashboard_id: string | null;
  source_name: string | null;
  created_by: string;
  created_at: string | Date;
}

interface CsvSection {
  title: string | null;
  result: AnalyticsQueryResultV1 | null;
  note: string | null;
}

/** Most rows one report may hold across its sections. */
const MAX_REPORT_ROWS = 50_000;

// ─── ReportService ────────────────────────────────────────────────────────────

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  /** Download token TTL: 15 minutes */
  private readonly TOKEN_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly db: DatabaseService,
    private readonly chartViews: ChartViewService,
    private readonly dashboards: DashboardService,
  ) {}

  // ── Report definitions ───────────────────────────────────────────────────

  async createReportDefinition(principal: AnalyticsPrincipal, input: unknown): Promise<ReportV1> {
    const parsed = CreateReportV1Schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequestException(`Invalid report: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
    }
    const report = parsed.data;
    const chartViewId = 'chartViewId' in report.source ? report.source.chartViewId : null;
    const dashboardId = 'dashboardId' in report.source ? report.source.dashboardId : null;
    // Reading the source proves it exists in this tenant (and 404s otherwise) before anything is written.
    if (chartViewId) await this.chartViews.get(principal, chartViewId);
    if (dashboardId) await this.dashboards.get(principal, dashboardId);

    const id = await this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.report_definitions
           (tenant_id, display_name, description, chart_view_id, dashboard_id, pinned_inputs, output_format, created_by)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'CSV', $6)
         RETURNING id`,
        [principal.tenantId, report.name, report.description, chartViewId, dashboardId, principal.subject],
      );
      const reportId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
         VALUES ($1, 'REPORT_DEFINITION_CREATED', $2, $3, 'REPORT_DEFINITION', $4::jsonb)`,
        [principal.tenantId, principal.subject, reportId, JSON.stringify({ name: report.name, source: report.source })],
      );
      return reportId;
    });
    return this.getReportDefinition(principal, id);
  }

  async listReportDefinitions(principal: AnalyticsPrincipal): Promise<ReportV1[]> {
    const result = await this.db.queryWithTenant<DefinitionRow>(principal.tenantId, `${DEFINITION_SELECT} ORDER BY d.created_at DESC LIMIT 200`, []);
    return Promise.all(result.rows.map((row) => this.toReport(principal, row)));
  }

  async getReportDefinition(principal: AnalyticsPrincipal, id: string): Promise<ReportV1> {
    const result = await this.db.queryWithTenant<DefinitionRow>(principal.tenantId, `${DEFINITION_SELECT} WHERE d.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException(`Report '${id}' not found.`);
    return this.toReport(principal, row);
  }

  // ── Report run (trigger) ─────────────────────────────────────────────────

  async triggerReportRun(principal: AnalyticsPrincipal, dto: TriggerReportRunDto): Promise<ReportRunV1> {
    const { tenantId, subject } = principal;
    const defResult = await this.db.queryWithTenant<DefinitionRow>(tenantId, `${DEFINITION_SELECT} WHERE d.id = $1`, [
      dto.reportDefinitionId,
    ]);
    const def = defResult.rows[0];
    if (!def) throw new NotFoundException(`Report definition '${dto.reportDefinitionId}' not found.`);

    // Duplicate suppression via idempotency key
    if (dto.idempotencyKey) {
      const existingRun = await this.db.queryWithTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM gigalibs_analytics.report_runs
         WHERE report_definition_id = $1 AND idempotency_key = $2`,
        [dto.reportDefinitionId, dto.idempotencyKey],
      );
      if (existingRun.rows.length > 0) return this.getReportRun(principal, existingRun.rows[0]!.id);
    }

    const runResult = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.report_runs
         (report_definition_id, tenant_id, status, idempotency_key, triggered_by)
       VALUES ($1, $2, 'QUEUED', $3, $4)
       RETURNING id`,
      [dto.reportDefinitionId, tenantId, dto.idempotencyKey ?? null, subject],
    );
    const runId = runResult.rows[0]!.id;

    // Execute synchronously within the request; the queue and scheduler arrive with WI-OI-104.
    await this.executeRun(principal, runId, def);
    return this.getReportRun(principal, runId);
  }

  // ── Download ─────────────────────────────────────────────────────────────

  async downloadArtifact(principal: AnalyticsPrincipal, downloadToken: string): Promise<DownloadResult> {
    const artifactResult = await this.db.queryWithTenant<{
      filename: string;
      content_type: string;
      content_sha256: string;
      token_expires_at: string | Date;
      content: Buffer | null;
    }>(
      principal.tenantId,
      `SELECT filename, content_type, content_sha256, token_expires_at, content
       FROM gigalibs_analytics.report_artifacts
       WHERE download_token = $1`,
      [downloadToken],
    );
    const artifact = artifactResult.rows[0];
    if (!artifact) throw new NotFoundException('Download token not found.');
    if (new Date(artifact.token_expires_at) < new Date()) {
      throw new GoneException('Download token has expired. Run the report again.');
    }
    if (!artifact.content) throw new GoneException('This file was produced before files were stored; run the report again.');
    return {
      filename: artifact.filename,
      contentType: artifact.content_type,
      bytes: artifact.content,
      contentSha256: artifact.content_sha256,
    };
  }

  // ── Schedule management ─────────────────────────────────────────────────

  async createSchedule(principal: AnalyticsPrincipal, dto: CreateScheduleDto): Promise<{ id: string }> {
    const { tenantId, subject } = principal;
    this.validateCronExpression(dto.cronExpression);
    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.report_schedules
         (report_definition_id, tenant_id, cron_expression,
          delivery_channel, delivery_target_ref, created_by)
       VALUES ($1, $2, $3, $4::gigalibs_analytics.delivery_channel, $5, $6)
       RETURNING id`,
      [dto.reportDefinitionId, tenantId, dto.cronExpression, dto.deliveryChannel, dto.deliveryTargetRef, subject],
    );
    return { id: result.rows[0]!.id };
  }

  async getReportRun(principal: AnalyticsPrincipal, runId: string): Promise<ReportRunV1> {
    const result = await this.db.queryWithTenant<Record<string, unknown>>(principal.tenantId, `${RUN_SELECT} WHERE rr.id = $1`, [runId]);
    if (result.rows.length === 0) throw new NotFoundException(`Report run '${runId}' not found.`);
    return toRun(result.rows[0]!);
  }

  async listReportRuns(principal: AnalyticsPrincipal, reportDefinitionId: string): Promise<ReportRunV1[]> {
    const result = await this.db.queryWithTenant<Record<string, unknown>>(
      principal.tenantId,
      `${RUN_SELECT} WHERE rr.report_definition_id = $1 ORDER BY rr.queued_at DESC LIMIT 50`,
      [reportDefinitionId],
    );
    return result.rows.map(toRun);
  }

  // ── Private: run execution ────────────────────────────────────────────────

  private async executeRun(principal: AnalyticsPrincipal, runId: string, def: DefinitionRow): Promise<void> {
    const { tenantId } = principal;
    let sections: CsvSection[];
    try {
      const { questions, sections: asked } = await this.ask(principal, def);
      sections = asked;
      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.report_runs
         SET status = 'RUNNING', pinned_query_snapshot = $2::jsonb, started_at = now()
         WHERE id = $1`,
        [runId, JSON.stringify(questions)],
      );
    } catch (err) {
      await this.fail(tenantId, runId, err);
      return;
    }

    try {
      const { csv, rowCount } = buildCsv(def.display_name, sections);
      const bytes = Buffer.from(csv, 'utf8');
      const contentSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const downloadToken = crypto.randomUUID();
      const tokenExpiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();
      const filename = `${slug(def.display_name)}-${new Date().toISOString().slice(0, 10)}.csv`;
      await this.db.withTenantTransaction(tenantId, async (client) => {
        await client.query(
          `INSERT INTO gigalibs_analytics.report_artifacts
             (run_id, tenant_id, filename, content_type, content_sha256,
              byte_size, download_token, token_expires_at, storage_ref, content)
           VALUES ($1, $2, $3, 'text/csv; charset=utf-8', $4, $5, $6, $7, 'db:report_artifacts', $8)`,
          [runId, tenantId, filename, contentSha256, bytes.length, downloadToken, tokenExpiresAt, bytes],
        );
        await client.query(
          `UPDATE gigalibs_analytics.report_runs
           SET status = 'SUCCEEDED', row_count = $2, completed_at = now()
           WHERE id = $1`,
          [runId, rowCount],
        );
        await client.query(
          `INSERT INTO gigalibs_analytics.analytics_audit_log
             (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
           VALUES ($1, 'REPORT_RUN_COMPLETED', $2, $3, 'REPORT_RUN', $4::jsonb)`,
          [tenantId, principal.subject, runId, JSON.stringify({ reportId: def.id, rowCount, contentSha256 })],
        );
      });
      this.logger.log(`[tenant:${tenantId}] Report run '${runId}' SUCCEEDED: ${rowCount} rows, sha256=${contentSha256.slice(0, 8)}…`);
    } catch (err) {
      await this.fail(tenantId, runId, err);
    }
  }

  /** Re-asks the report's stored question(s) with the caller's rights. */
  private async ask(
    principal: AnalyticsPrincipal,
    def: DefinitionRow,
  ): Promise<{ questions: unknown; sections: CsvSection[] }> {
    if (def.chart_view_id) {
      const { view, result } = await this.chartViews.data(principal, def.chart_view_id);
      return { questions: { chartView: view.id, query: view.query }, sections: [{ title: null, result, note: null }] };
    }
    if (def.dashboard_id) {
      const data = await this.dashboards.data(principal, def.dashboard_id, {});
      return {
        questions: { dashboard: def.dashboard_id, tiles: data.tiles.map((tile) => tile.chartViewId) },
        sections: data.tiles.map((tile) => ({ title: tile.name, result: tile.result, note: tile.error })),
      };
    }
    throw new Error('This report uses a retired chart definition; recreate it from a saved chart or a dashboard.');
  }

  private async fail(tenantId: string, runId: string, err: unknown): Promise<void> {
    const msg = err instanceof Error ? err.message : String(err);
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_analytics.report_runs
       SET status = 'FAILED', error_message = $2, completed_at = now()
       WHERE id = $1`,
      [runId, msg],
    );
  }

  private async toReport(principal: AnalyticsPrincipal, row: DefinitionRow): Promise<ReportV1> {
    const last = await this.db.queryWithTenant<Record<string, unknown>>(
      principal.tenantId,
      `${RUN_SELECT} WHERE rr.report_definition_id = $1 ORDER BY rr.queued_at DESC LIMIT 1`,
      [row.id],
    );
    return {
      id: row.id,
      name: row.display_name,
      description: row.description,
      source: row.chart_view_id
        ? { kind: 'chart_view', id: row.chart_view_id, name: row.source_name ?? 'Saved chart' }
        : row.dashboard_id
          ? { kind: 'dashboard', id: row.dashboard_id, name: row.source_name ?? 'Dashboard' }
          : { kind: 'retired_chart', id: row.chart_definition_id!, name: 'Retired chart definition' },
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      lastRun: last.rows[0] ? toRun(last.rows[0]) : null,
    };
  }

  private validateCronExpression(expr: string): void {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new BadRequestException(
        `Invalid cron expression '${expr}'. Must have exactly 5 fields (minute hour day month weekday).`,
      );
    }
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const DEFINITION_SELECT = `
  SELECT d.id, d.display_name, d.description, d.chart_definition_id, d.chart_view_id, d.dashboard_id,
         COALESCE(v.name, db.display_name) AS source_name, d.created_by, d.created_at
    FROM gigalibs_analytics.report_definitions d
    LEFT JOIN gigalibs_analytics.chart_views v ON v.id = d.chart_view_id
    LEFT JOIN gigalibs_analytics.dashboards db ON db.id = d.dashboard_id`;

const RUN_SELECT = `
  SELECT rr.id, rr.report_definition_id, rr.status, rr.row_count, rr.error_message, rr.triggered_by,
         rr.queued_at, rr.completed_at, ra.download_token, ra.token_expires_at, ra.filename
    FROM gigalibs_analytics.report_runs rr
    LEFT JOIN gigalibs_analytics.report_artifacts ra ON ra.run_id = rr.id`;

function toRun(row: Record<string, unknown>): ReportRunV1 {
  const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());
  const expiresAt = iso(row['token_expires_at']);
  return {
    id: row['id'] as string,
    reportId: row['report_definition_id'] as string,
    status: row['status'] as ReportRunV1['status'],
    rowCount: row['row_count'] === null || row['row_count'] === undefined ? null : Number(row['row_count']),
    errorMessage: (row['error_message'] as string | null) ?? null,
    triggeredBy: row['triggered_by'] as string,
    queuedAt: iso(row['queued_at'])!,
    completedAt: iso(row['completed_at']),
    // An expired token is not offered; the run can be repeated.
    download:
      row['download_token'] && expiresAt && new Date(expiresAt) > new Date()
        ? { token: row['download_token'] as string, expiresAt, filename: row['filename'] as string }
        : null,
  };
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** RFC 4180 CSV: one table per section, labelled headers, typed values, spreadsheet-safe text. */
export function buildCsv(reportName: string, sections: readonly CsvSection[]): { csv: string; rowCount: number } {
  const lines: string[] = [csvRow([reportName]), csvRow([`Generated ${new Date().toISOString()}`])];
  let rowCount = 0;
  for (const section of sections) {
    lines.push('');
    if (section.title) lines.push(csvRow([section.title]));
    if (!section.result) {
      lines.push(csvRow([section.note ?? 'This chart could not be drawn.']));
      continue;
    }
    lines.push(csvRow(section.result.columns.map((column) => column.label)));
    for (const row of section.result.rows) {
      if (rowCount >= MAX_REPORT_ROWS) throw new Error(`This report has more than ${MAX_REPORT_ROWS} rows; narrow its question.`);
      lines.push(csvRow(row));
      rowCount += 1;
    }
    if (section.result.truncated) lines.push(csvRow(['More rows matched than this chart returns; narrow its question.']));
  }
  return { csv: `${lines.join('\r\n')}\r\n`, rowCount };
}

function csvRow(cells: ReadonlyArray<string | number | boolean | null>): string {
  return cells.map(csvCell).join(',');
}

export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value !== 'string') return String(value);
  // A spreadsheet would run text starting with these as a formula (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report';
}
