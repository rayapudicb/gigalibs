/**
 * Summaries (WI-OI-103c): pre-aggregated rows that answer dashboard questions fast. Saving a chart view or a dashboard
 * asks for the summaries its questions need; they build in the background (the kernel job runner takes this over in
 * WI-OI-104) and the query engine uses a READY one whenever it answers a question exactly. A summary is only an
 * optimisation: every failure leaves the question on the raw rows.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsFieldType, AnalyticsQueryV1 } from '@gigalibs/contracts';
import { DatabaseService } from '../database/database.service.js';
import { loadDatasetFields } from './dataset-fields.js';
import {
  type BuiltSummary,
  type SummaryShape,
  buildSummaryInsert,
  summaryNumericFields,
  summaryShapeFor,
} from './summary-plan.js';

/** A build still BUILDING after this long is treated as lost (for example, the process restarted) and started again. */
const STALE_BUILD_MS = 10 * 60 * 1000;
/** Longest one summary build may run. */
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private readonly building = new Set<string>();

  constructor(private readonly db: DatabaseService) {}

  /** READY summaries of a dataset version. */
  async ready(tenantId: string, datasetVersionId: string): Promise<BuiltSummary[]> {
    const result = await this.db.queryWithTenant<{
      id: string;
      dimensions: string[];
      time_field: string | null;
      numeric_fields: string[];
      row_count: number | null;
    }>(
      tenantId,
      `SELECT id, dimensions, time_field, numeric_fields, row_count FROM gigalibs_analytics.analytics_summaries
        WHERE dataset_version_id = $1 AND status = 'READY'`,
      [datasetVersionId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      dimensions: row.dimensions,
      timeField: row.time_field,
      numericFields: row.numeric_fields,
      rowCount: Number(row.row_count ?? 0),
    }));
  }

  /**
   * Asks for the summaries a saved question needs, plus any extra filter fields a dashboard offers. Never throws: a
   * failure only means the question keeps using the raw rows.
   */
  async ensureForQuestion(
    tenantId: string,
    query: Pick<AnalyticsQueryV1, 'semanticModelId' | 'dimensions' | 'filters' | 'time'>,
    extraFilterFields: readonly string[] = [],
  ): Promise<void> {
    try {
      const model = await this.db.queryWithTenant<{ dataset_version_id: string }>(
        tenantId,
        `SELECT dataset_version_id FROM gigalibs_analytics.semantic_models WHERE id = $1`,
        [query.semanticModelId],
      );
      const datasetVersionId = model.rows[0]?.dataset_version_id;
      if (!datasetVersionId) return;
      const fields = await loadDatasetFields(this.db, tenantId, datasetVersionId);
      const shape = summaryShapeFor(query, fields, extraFilterFields);
      if (shape) await this.ensure(tenantId, datasetVersionId, shape, fields);
    } catch (error) {
      this.logger.warn(`[tenant:${tenantId}] Summary request skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Records the summary and starts its build when it is new, failed or stuck. Returns the summary id. */
  async ensure(
    tenantId: string,
    datasetVersionId: string,
    shape: SummaryShape,
    fields: ReadonlyMap<string, AnalyticsFieldType>,
    options: { wait?: boolean } = {},
  ): Promise<string> {
    const numericFields = summaryNumericFields(fields);
    const existing = await this.db.queryWithTenant<{ id: string; status: string; requested_at: string | Date }>(
      tenantId,
      `SELECT id, status, requested_at FROM gigalibs_analytics.analytics_summaries
        WHERE dataset_version_id = $1 AND dimensions = $2::text[] AND time_field IS NOT DISTINCT FROM $3`,
      [datasetVersionId, shape.dimensions, shape.timeField],
    );
    let id = existing.rows[0]?.id;
    let start = false;
    if (!id) {
      const created = await this.db.queryWithTenant<{ id: string }>(
        tenantId,
        `INSERT INTO gigalibs_analytics.analytics_summaries
           (tenant_id, dataset_version_id, dimensions, time_field, numeric_fields, status)
         VALUES ($1, $2, $3::text[], $4, $5::text[], 'BUILDING')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [tenantId, datasetVersionId, shape.dimensions, shape.timeField, numericFields],
      );
      id = created.rows[0]?.id;
      if (!id) return this.ensure(tenantId, datasetVersionId, shape, fields, options); // created concurrently
      start = true;
    } else {
      const row = existing.rows[0]!;
      const stale = row.status === 'BUILDING' && Date.now() - new Date(row.requested_at).getTime() > STALE_BUILD_MS;
      if ((row.status === 'FAILED' || stale) && !this.building.has(id)) {
        await this.db.queryWithTenant(
          tenantId,
          `UPDATE gigalibs_analytics.analytics_summaries
              SET status = 'BUILDING', requested_at = now(), error = NULL, numeric_fields = $2::text[]
            WHERE id = $1`,
          [id, numericFields],
        );
        start = true;
      }
    }
    if (start) {
      const build = this.build(tenantId, id, datasetVersionId, shape, numericFields);
      if (options.wait) await build;
      else void build;
    }
    return id;
  }

  /** Fills a summary from the raw rows in one transaction; marks it READY, or FAILED with the reason. */
  async build(
    tenantId: string,
    summaryId: string,
    datasetVersionId: string,
    shape: SummaryShape,
    numericFields: readonly string[],
  ): Promise<void> {
    if (this.building.has(summaryId)) return;
    this.building.add(summaryId);
    const started = Date.now();
    try {
      const rows = await this.db.withTenantTransaction(tenantId, async (client) => {
        await client.query('SELECT set_config($1, $2, true)', ['statement_timeout', String(BUILD_TIMEOUT_MS)]);
        await client.query(`DELETE FROM gigalibs_analytics.analytics_summary_rows WHERE summary_id = $1`, [summaryId]);
        const insert = buildSummaryInsert({ summaryId, tenantId, datasetVersionId, shape, numericFields });
        const inserted = await client.query(insert.text, insert.params);
        await client.query(
          `UPDATE gigalibs_analytics.analytics_summaries
              SET status = 'READY', row_count = $2, built_at = now(), error = NULL
            WHERE id = $1`,
          [summaryId, inserted.rowCount ?? 0],
        );
        return inserted.rowCount ?? 0;
      });
      this.logger.log(`[tenant:${tenantId}] Summary ${summaryId} READY: ${rows} rows in ${Date.now() - started} ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[tenant:${tenantId}] Summary ${summaryId} FAILED: ${message}`);
      await this.db
        .queryWithTenant(
          tenantId,
          `UPDATE gigalibs_analytics.analytics_summaries SET status = 'FAILED', error = $2 WHERE id = $1`,
          [summaryId, message.slice(0, 1000)],
        )
        .catch(() => undefined);
    } finally {
      this.building.delete(summaryId);
    }
  }
}
