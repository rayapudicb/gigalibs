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

import { BadRequestException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  type AnalyticsFilterV1,
  type AnalyticsQueryResultV1,
  type ChartTypeV1,
  CreateReportV1Schema,
  type PlaceDirectoryEntryV1,
  type ReportDownloadTokenV1,
  type ReportFileV1,
  type ReportFormatV1,
  type ReportRunV1,
  type ReportV1,
  UpdateReportFormatsV1Schema,
} from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { ChartViewService } from '../query-engine/chart-view.service.js';
import { DashboardService } from '../query-engine/dashboard.service.js';
import { PlaceAnalyticsService } from '../places/place-analytics.service.js';
import { buildPdf, buildXlsx, type ReportMeta, type ReportSection } from './report-files.js';

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

interface DefinitionRow {
  id: string;
  display_name: string;
  description: string | null;
  chart_definition_id: string | null;
  chart_view_id: string | null;
  dashboard_id: string | null;
  formats?: string[] | null;
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
    @Optional() private readonly places?: PlaceAnalyticsService,
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

    const formats = report.formats && report.formats.length > 0 ? report.formats : ['CSV'];

    const id = await this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.report_definitions
           (tenant_id, display_name, description, chart_view_id, dashboard_id, pinned_inputs, output_format, created_by, formats)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'CSV', $6, $7)
         RETURNING id`,
        [principal.tenantId, report.name, report.description, chartViewId, dashboardId, principal.subject, formats],
      );
      const reportId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
         VALUES ($1, 'REPORT_DEFINITION_CREATED', $2, $3, 'REPORT_DEFINITION', $4::jsonb)`,
        [principal.tenantId, principal.subject, reportId, JSON.stringify({ name: report.name, source: report.source, formats })],
      );
      return reportId;
    });
    return this.getReportDefinition(principal, id);
  }

  async updateReportFormats(principal: AnalyticsPrincipal, id: string, input: unknown): Promise<ReportV1> {
    const parsed = UpdateReportFormatsV1Schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequestException(`Invalid report formats: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
    }
    await this.getReportDefinition(principal, id);

    await this.db.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query(
        `UPDATE gigalibs_analytics.report_definitions
         SET formats = $1
         WHERE id = $2 AND tenant_id = $3`,
        [parsed.data.formats, id, principal.tenantId],
      );
      await client.query(
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
         VALUES ($1, 'REPORT_DEFINITION_UPDATED', $2, $3, 'REPORT_DEFINITION', $4::jsonb)`,
        [principal.tenantId, principal.subject, id, JSON.stringify({ formats: parsed.data.formats })],
      );
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

  // ── Download & Token Renewal ─────────────────────────────────────────────

  async generateDownloadToken(
    principal: AnalyticsPrincipal,
    runId: string,
    formatInput: string,
  ): Promise<ReportDownloadTokenV1> {
    const format = formatInput.toUpperCase() as ReportFormatV1;
    if (!['CSV', 'XLSX', 'PDF'].includes(format)) {
      throw new BadRequestException(`Invalid report format '${formatInput}'. Choose CSV, XLSX, or PDF.`);
    }

    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const artifactResult = await client.query<{
        id: string;
        filename: string;
        triggered_by: string;
      }>(
        `SELECT a.id, a.filename, rr.triggered_by
         FROM gigalibs_analytics.report_artifacts a
         JOIN gigalibs_analytics.report_runs rr ON rr.id = a.run_id
         WHERE a.run_id = $1 AND a.format = $2`,
        [runId, format],
      );

      const artifact = artifactResult.rows[0];
      if (!artifact) {
        throw new NotFoundException(`Report artifact for run '${runId}' and format '${format}' not found.`);
      }

      if (principal.spatialScope.mode !== 'UNBOUNDED' && artifact.triggered_by !== principal.subject) {
        throw new ForbiddenException('You can only download reports generated within your own place scope.');
      }

      // Safe expired grant cleanup for this tenant
      await client.query(
        `DELETE FROM gigalibs_analytics.report_download_grants
         WHERE tenant_id = $1 AND expires_at < now()`,
        [principal.tenantId],
      );

      const rawToken = crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MS);

      await client.query(
        `INSERT INTO gigalibs_analytics.report_download_grants
           (tenant_id, artifact_id, token_hash, user_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [principal.tenantId, artifact.id, tokenHash, principal.subject, expiresAt.toISOString()],
      );

      return {
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
        format,
        filename: artifact.filename,
      };
    });
  }

  async downloadArtifact(principal: AnalyticsPrincipal, downloadToken: string): Promise<DownloadResult> {
    const tokenHash = crypto.createHash('sha256').update(downloadToken).digest('hex');

    // 1. Check grants table first (hashed token lookup bound to requesting user)
    const grantResult = await this.db.queryWithTenant<{
      filename: string;
      content_type: string;
      content_sha256: string;
      expires_at: string | Date;
      content: Buffer | null;
      triggered_by: string;
    }>(
      principal.tenantId,
      `SELECT a.filename, a.content_type, a.content_sha256, g.expires_at, a.content, rr.triggered_by
       FROM gigalibs_analytics.report_download_grants g
       JOIN gigalibs_analytics.report_artifacts a ON a.id = g.artifact_id
       JOIN gigalibs_analytics.report_runs rr ON rr.id = a.run_id
       WHERE g.token_hash = $1 AND g.user_id = $2`,
      [tokenHash, principal.subject],
    );

    if (grantResult.rows.length > 0 && 'expires_at' in grantResult.rows[0]!) {
      const grant = grantResult.rows[0]!;
      if (principal.spatialScope.mode !== 'UNBOUNDED' && grant.triggered_by !== principal.subject) {
        throw new ForbiddenException('You can only download reports generated within your own place scope.');
      }
      if (new Date(grant.expires_at) < new Date()) {
        throw new GoneException('Download token has expired. Request a new download token.');
      }
      if (!grant.content) throw new GoneException('This file was produced before files were stored; run the report again.');
      return {
        filename: grant.filename,
        contentType: grant.content_type,
        bytes: grant.content,
        contentSha256: grant.content_sha256,
      };
    }

    // 2. Fallback: check legacy download_token on report_artifacts (backwards compatibility)
    const artifactResult = await this.db.queryWithTenant<{
      filename: string;
      content_type: string;
      content_sha256: string;
      token_expires_at: string | Date;
      content: Buffer | null;
    }>(
      principal.tenantId,
      // WI-OI-105d: a member with a place scope downloads only files of runs they started, which were made under
      // their own scope; another member's file may hold records outside their places.
      `SELECT a.filename, a.content_type, a.content_sha256, a.token_expires_at, a.content
       FROM gigalibs_analytics.report_artifacts a
       JOIN gigalibs_analytics.report_runs rr ON rr.id = a.run_id
       WHERE a.download_token = $1 AND ($2::text IS NULL OR rr.triggered_by = $2)`,
      [downloadToken, principal.spatialScope.mode === 'UNBOUNDED' ? null : principal.subject],
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

  // Schedules live in the kernel (WI-OI-104c): the kernel worker calls POST v1/reports/runs as the schedule's owner.

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
    let questions: unknown;
    let sections: ReportSection[];
    try {
      const asked = await this.ask(principal, def);
      questions = asked.questions;
      sections = asked.sections;
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
      const requestedFormats: ReportFormatV1[] =
        def.formats && def.formats.length > 0 ? (def.formats as ReportFormatV1[]) : ['CSV'];

      // Build CSV first to compute rowCount and check MAX_REPORT_ROWS
      const { csv, rowCount } = buildCsv(def.display_name, sections);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const baseSlug = slug(def.display_name);
      const tokenExpiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();

      const meta: ReportMeta = {
        reportName: def.display_name,
        sourceName: def.source_name ?? def.display_name,
        generatedAt: now,
      };

      interface GeneratedFile {
        format: ReportFormatV1;
        filename: string;
        contentType: string;
        bytes: Buffer;
        contentSha256: string;
        downloadToken: string;
        tokenExpiresAt: string;
      }

      const filesToPersist: GeneratedFile[] = [];

      for (const fmt of requestedFormats) {
        if (fmt === 'CSV') {
          const bytes = Buffer.from(csv, 'utf8');
          filesToPersist.push({
            format: 'CSV',
            filename: `${baseSlug}-${dateStr}.csv`,
            contentType: 'text/csv; charset=utf-8',
            bytes,
            contentSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            downloadToken: crypto.randomUUID(),
            tokenExpiresAt,
          });
        } else if (fmt === 'XLSX') {
          const bytes = await buildXlsx(meta, sections);
          filesToPersist.push({
            format: 'XLSX',
            filename: `${baseSlug}-${dateStr}.xlsx`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            bytes,
            contentSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            downloadToken: crypto.randomUUID(),
            tokenExpiresAt,
          });
        } else if (fmt === 'PDF') {
          const bytes = await buildPdf(meta, sections);
          filesToPersist.push({
            format: 'PDF',
            filename: `${baseSlug}-${dateStr}.pdf`,
            contentType: 'application/pdf',
            bytes,
            contentSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            downloadToken: crypto.randomUUID(),
            tokenExpiresAt,
          });
        }
      }

      await this.db.withTenantTransaction(tenantId, async (client) => {
        for (const file of filesToPersist) {
          await client.query(
            `INSERT INTO gigalibs_analytics.report_artifacts
               (run_id, tenant_id, filename, content_type, content_sha256,
                byte_size, download_token, token_expires_at, storage_ref, format, content)
             VALUES ($1, $2, $3, $9, $4, $5, $6, $7, 'db:report_artifacts', $10, $8)`,
            [
              runId,
              tenantId,
              file.filename,
              file.contentSha256,
              file.bytes.length,
              file.downloadToken,
              file.tokenExpiresAt,
              file.bytes,
              file.contentType,
              file.format,
            ],
          );
        }
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
          [
            tenantId,
            principal.subject,
            runId,
            JSON.stringify({
              reportId: def.id,
              rowCount,
              formats: filesToPersist.map((f) => f.format),
              sha256: filesToPersist.map((f) => ({ format: f.format, sha256: f.contentSha256 })),
            }),
          ],
        );
      });
      this.logger.log(`[tenant:${tenantId}] Report run '${runId}' SUCCEEDED: ${rowCount} rows, ${filesToPersist.length} files`);
    } catch (err) {
      await this.fail(tenantId, runId, err);
    }
  }

  /** Re-asks the report's stored question(s) with the caller's rights. */
  private async ask(
    principal: AnalyticsPrincipal,
    def: DefinitionRow,
  ): Promise<{ questions: unknown; sections: ReportSection[] }> {
    if (def.chart_view_id) {
      const { view, result } = await this.chartViews.data(principal, def.chart_view_id);
      let places: PlaceDirectoryEntryV1[] | undefined;
      const chartType = (view.visual?.type ?? 'table') as ChartTypeV1;
      if (chartType === 'place_map' && this.places) {
        try {
          const dir = await this.places.directory(principal, { boundaries: 'true', under: view.query.placeUnder });
          places = [...dir.places];
        } catch {
          // If directory loading fails or not configured, placeMap will skip drawing
        }
      }
      return {
        questions: { chartView: view.id, query: view.query },
        sections: [
          {
            title: null,
            result,
            note: null,
            chartType,
            filters: describeFilters(view.query),
            places,
          },
        ],
      };
    }
    if (def.dashboard_id) {
      const data = await this.dashboards.data(principal, def.dashboard_id, {});
      const sections: ReportSection[] = [];
      for (const tile of data.tiles) {
        let places: PlaceDirectoryEntryV1[] | undefined;
        const chartType = (tile.chartType ?? 'table') as ChartTypeV1;
        if (chartType === 'place_map' && this.places) {
          try {
            const dir = await this.places.directory(principal, { boundaries: 'true' });
            places = [...dir.places];
          } catch {
            // Skip
          }
        }
        sections.push({
          title: tile.name,
          result: tile.result,
          note: tile.error,
          chartType,
          filters: tile.applied ?? [],
          places,
        });
      }
      return {
        questions: { dashboard: def.dashboard_id, tiles: data.tiles.map((tile) => tile.chartViewId) },
        sections,
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
    const formats = (row.formats && row.formats.length > 0 ? row.formats : ['CSV']) as ReportFormatV1[];
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
      formats,
      lastRun: last.rows[0] ? toRun(last.rows[0]) : null,
    };
  }

}

// ─── Queries ──────────────────────────────────────────────────────────────────

const DEFINITION_SELECT = `
  SELECT d.id, d.display_name, d.description, d.chart_definition_id, d.chart_view_id, d.dashboard_id,
         d.formats,
         COALESCE(v.name, db.display_name) AS source_name, d.created_by, d.created_at
    FROM gigalibs_analytics.report_definitions d
    LEFT JOIN gigalibs_analytics.chart_views v ON v.id = d.chart_view_id
    LEFT JOIN gigalibs_analytics.dashboards db ON db.id = d.dashboard_id`;

const RUN_SELECT = `
  SELECT rr.id, rr.report_definition_id, rr.status, rr.row_count, rr.error_message, rr.triggered_by,
         rr.queued_at, rr.completed_at,
         (
           SELECT json_agg(json_build_object(
             'format', ra.format,
             'token', ra.download_token,
             'expiresAt', ra.token_expires_at,
             'filename', ra.filename,
             'byteSize', ra.byte_size
           ) ORDER BY CASE ra.format WHEN 'CSV' THEN 1 WHEN 'XLSX' THEN 2 WHEN 'PDF' THEN 3 ELSE 4 END)
           FROM gigalibs_analytics.report_artifacts ra
           WHERE ra.run_id = rr.id
         ) AS files
    FROM gigalibs_analytics.report_runs rr`;

function toRun(row: Record<string, unknown>): ReportRunV1 {
  const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());
  let files: ReportFileV1[] = [];
  if (Array.isArray(row['files'])) {
    files = (row['files'] as Array<Record<string, unknown>>)
      .filter((f) => f && f.format && f.filename)
      .map((f) => {
        const hasValidToken = Boolean(f.token && f.expiresAt && new Date(f.expiresAt as string) > new Date());
        return {
          format: f.format as ReportFileV1['format'],
          token: hasValidToken ? (f.token as string) : null,
          expiresAt: hasValidToken ? iso(f.expiresAt) : null,
          filename: f.filename as string,
          byteSize: Number(f.byteSize ?? 0),
        };
      });
  } else if (row['download_token'] || row['filename']) {
    const expiresAt = iso(row['token_expires_at']);
    const hasValidToken = Boolean(expiresAt && new Date(expiresAt) > new Date());
    files = [
      {
        format: ((row['format'] as string) || 'CSV') as ReportFileV1['format'],
        token: hasValidToken ? (row['download_token'] as string) : null,
        expiresAt: hasValidToken ? expiresAt : null,
        filename: (row['filename'] as string) ?? 'report.csv',
        byteSize: Number(row['byte_size'] ?? 0),
      },
    ];
  }

  // The CSV's (or the first file's) short-lived token, kept for older callers; files lists every format
  const csvFile = files.find((f) => f.format === 'CSV') ?? files[0];
  const download = csvFile && csvFile.token && csvFile.expiresAt ? { token: csvFile.token, expiresAt: csvFile.expiresAt, filename: csvFile.filename } : null;

  return {
    id: row['id'] as string,
    reportId: row['report_definition_id'] as string,
    status: row['status'] as ReportRunV1['status'],
    rowCount: row['row_count'] === null || row['row_count'] === undefined ? null : Number(row['row_count']),
    errorMessage: (row['error_message'] as string | null) ?? null,
    triggeredBy: row['triggered_by'] as string,
    queuedAt: iso(row['queued_at'])!,
    completedAt: iso(row['completed_at']),
    download,
    files,
  };
}

function describeFilters(query?: { filters?: AnalyticsFilterV1[]; placeUnder?: string }): string[] {
  if (!query) return [];
  const words: string[] = [];
  if (query.placeUnder) words.push(`Place under: ${query.placeUnder}`);
  for (const f of query.filters ?? []) {
    switch (f.op) {
      case 'eq': words.push(`${f.field} = ${f.value}`); break;
      case 'neq': words.push(`${f.field} != ${f.value}`); break;
      case 'in': words.push(`${f.field} in (${f.values.join(', ')})`); break;
      case 'gte': words.push(`${f.field} >= ${f.value}`); break;
      case 'lte': words.push(`${f.field} <= ${f.value}`); break;
      case 'between': words.push(`${f.field} between ${f.from} and ${f.to}`); break;
    }
  }
  return words;
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
