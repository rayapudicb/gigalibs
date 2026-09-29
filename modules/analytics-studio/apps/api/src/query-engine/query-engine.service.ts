/**
 * QueryEngineService — Governed Query Engine
 *
 * Executes semantic-model measures against dataset_record_versions,
 * computing aggregate results with full freshness metadata.
 *
 * Freshness states (exactly the 5 governed values):
 *   FRESH        — dataset is current, result is real-time accurate
 *   STALE        — dataset exists but exceeds the chart's freshness_ttl
 *   PARTIAL      — some records are missing (build was interrupted)
 *   REBUILDING   — a new dataset build is currently in progress
 *   UNAVAILABLE  — no READY dataset version found
 *
 * UNAUTHORIZED is never a freshness state.
 */

import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  type AnalyticsFieldType,
  type AnalyticsQueryResultV1,
  AnalyticsQueryV1Schema,
  FormulaMeasureDefinitionV1Schema,
} from '@gigalibs/contracts';
import { loadDatasetFields } from './dataset-fields.js';
import { AnalyticsQuerySpecError, buildAnalyticsQuery, type QueryMeasure } from './query-builder.js';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FreshnessState = 'FRESH' | 'STALE' | 'PARTIAL' | 'REBUILDING' | 'UNAVAILABLE';
// NOTE: 'UNAUTHORIZED' is NOT a FreshnessState. Authorization failures
//       surface as HTTP 403 from PlatformContextAuthorizationGuard, not as a data signal.

export interface MeasureResult {
  measureName: string;
  aggregateFn: string;
  fieldReference: string;
  displayLabel: string;
  value: number | null;
}

export interface QueryResponse {
  chartDefinitionId: string;
  /** ISO 8601 timestamp of the query execution */
  asOf: string;
  /** Watermark value from the most-recent sync run feeding this dataset */
  watermark: string | null;
  /** semantic_model_versions.version_number used for this query */
  definitionVersion: number;
  freshness: FreshnessState;
  results: MeasureResult[];
  /** Tabular equivalent for accessibility (row per measure) */
  accessibleTable: Array<{ label: string; value: string | null }>;
}

export interface RunQueryDto {
  chartDefinitionId: string;
  /** If provided, apply only this subset of the chart's measure_names */
  measureFilter?: string[];
  /** Override dimension grouping for a single query */
  dimensionOverride?: string;
}

/** Freshness window for ad-hoc query specs; saved charts carry their own (WI-OI-103d). */
export const SPEC_FRESHNESS_TTL_SECONDS = 3600;

// ─── QueryEngineService ───────────────────────────────────────────────────────

@Injectable()
export class QueryEngineService {
  private readonly logger = new Logger(QueryEngineService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Execute a governed query against the most-recent READY dataset version
   * for the chart definition's semantic model.
   */
  async runQuery(principal: AnalyticsPrincipal, dto: RunQueryDto): Promise<QueryResponse> {
    const { tenantId } = principal;
    const asOf = new Date().toISOString();

    // 1. Load chart definition (enforces tenant isolation via RLS)
    const chartResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT cd.id, cd.semantic_model_id, cd.measure_names, cd.dimension_field,
              cd.freshness_ttl_seconds, cd.chart_type
       FROM gigalibs_analytics.chart_definitions cd
       WHERE cd.id = $1`,
      [dto.chartDefinitionId],
    );
    if (chartResult.rows.length === 0) {
      throw new NotFoundException(`Chart definition '${dto.chartDefinitionId}' not found.`);
    }
    const chart = chartResult.rows[0]!;

    // 2. Load semantic model + its measures (version-pinned)
    const modelResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT sm.id, sm.dataset_version_id, sm.display_name,
              smv.version_number,
              sm_meas.measure_name, sm_meas.aggregate_fn,
              sm_meas.field_reference, sm_meas.display_label
       FROM gigalibs_analytics.semantic_models sm
       JOIN gigalibs_analytics.semantic_model_versions smv
         ON smv.model_id = sm.id
       JOIN gigalibs_analytics.semantic_measures sm_meas
         ON sm_meas.model_id = sm.id
       WHERE sm.id = $1
         AND smv.version_number = (
           SELECT MAX(version_number)
           FROM gigalibs_analytics.semantic_model_versions
           WHERE model_id = sm.id
         )`,
      [chart.semantic_model_id],
    );

    if (modelResult.rows.length === 0) {
      return this.unavailableResponse(dto.chartDefinitionId, asOf, 'No published semantic model found.');
    }

    const definitionVersion: number = modelResult.rows[0]!.version_number;
    const datasetVersionId: string = modelResult.rows[0]!.dataset_version_id;

    // Filter measures to requested subset (if provided)
    let measures: Array<{ measure_name: string; aggregate_fn: string; field_reference: string; display_label: string }> =
      modelResult.rows;
    if (dto.measureFilter && dto.measureFilter.length > 0) {
      const filterSet = new Set(dto.measureFilter);
      measures = measures.filter((m) => filterSet.has(m.measure_name));
    }

    // 3. Determine freshness
    const { freshness, watermark } = await this.computeFreshness(
      tenantId,
      datasetVersionId,
      chart.freshness_ttl_seconds,
    );

    if (freshness === 'UNAVAILABLE') {
      return this.unavailableResponse(dto.chartDefinitionId, asOf, 'No READY dataset version.');
    }

    // 4. Execute measure aggregations against dataset_record_versions
    const results: MeasureResult[] = [];
    for (const m of measures) {
      const value = await this.executeMeasure(tenantId, datasetVersionId, m, dto.dimensionOverride);
      results.push({
        measureName: m.measure_name,
        aggregateFn: m.aggregate_fn,
        fieldReference: m.field_reference,
        displayLabel: m.display_label,
        value,
      });
    }

    // 5. Build accessible table equivalent (required for every chart response)
    const accessibleTable = results.map((r) => ({
      label: r.displayLabel,
      value: r.value === null ? null : String(r.value),
    }));

    return {
      chartDefinitionId: dto.chartDefinitionId,
      asOf,
      watermark,
      definitionVersion,
      freshness,
      results,
      accessibleTable,
    };
  }

  // ── Freshness computation ──────────────────────────────────────────────────

  /**
   * Execute an AnalyticsQueryV1 (WI-OI-103a): measures by dimensions, per time grain, filtered and sorted, over the
   * semantic model's latest version and its READY dataset. Fields are whitelisted against the published mapping.
   */
  async runSpec(principal: AnalyticsPrincipal, input: unknown): Promise<AnalyticsQueryResultV1> {
    const parsed = AnalyticsQueryV1Schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BadRequestException(`Invalid query: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
    }
    const query = parsed.data;
    const { tenantId } = principal;
    const asOf = new Date().toISOString();

    const modelResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT sm.id, sm.dataset_version_id, smv.version_number,
              sm_meas.measure_name, sm_meas.aggregate_fn, sm_meas.field_reference, sm_meas.display_label
       FROM gigalibs_analytics.semantic_models sm
       JOIN gigalibs_analytics.semantic_model_versions smv ON smv.model_id = sm.id
       JOIN gigalibs_analytics.semantic_measures sm_meas ON sm_meas.model_id = sm.id
       WHERE sm.id = $1
         AND smv.version_number = (
           SELECT MAX(version_number) FROM gigalibs_analytics.semantic_model_versions WHERE model_id = sm.id
         )`,
      [query.semanticModelId],
    );
    if (modelResult.rows.length === 0) {
      throw new NotFoundException(`Semantic model '${query.semanticModelId}' not found.`);
    }
    const datasetVersionId: string = modelResult.rows[0]!.dataset_version_id;
    const definitionVersion: number = modelResult.rows[0]!.version_number;
    const empty = (freshness: AnalyticsQueryResultV1['freshness'], watermark: string | null): AnalyticsQueryResultV1 => ({
      semanticModelId: query.semanticModelId,
      datasetVersionId,
      definitionVersion,
      measureVersions: {},
      asOf,
      freshness,
      watermark,
      columns: [],
      rows: [],
      truncated: false,
    });

    const { freshness, watermark } = await this.computeFreshness(tenantId, datasetVersionId, SPEC_FRESHNESS_TTL_SECONDS);
    if (freshness === 'UNAVAILABLE') return empty(freshness, watermark);

    const fields = await loadDatasetFields(this.db, tenantId, datasetVersionId);
    const measures = new Map<string, QueryMeasure>(
      modelResult.rows.map((row: any) => [
        row.measure_name,
        {
          name: row.measure_name,
          aggregateFn: row.aggregate_fn,
          fieldReference: row.field_reference,
          label: row.display_label,
        },
      ]),
    );
    const formulaRows = await this.db.queryWithTenant<{
      measure_name: string;
      current_published_version_id: string | null;
      version_id: string;
      definition: unknown;
    }>(
      tenantId,
      `SELECT fm.measure_name, fm.current_published_version_id,
              fmv.id AS version_id, fmv.definition
       FROM gigalibs_analytics.formula_measures fm
       JOIN gigalibs_analytics.formula_measure_versions fmv
         ON fmv.formula_measure_id = fm.id
       WHERE fm.semantic_model_id = $1
         AND fm.measure_name = ANY($2::text[])
         AND EXISTS (
           SELECT 1 FROM gigalibs_analytics.formula_measure_reviews review
           WHERE review.formula_measure_version_id = fmv.id AND review.decision = 'APPROVED'
         )`,
      [query.semanticModelId, query.measures],
    );
    const resolvedMeasureVersions: Record<string, string> = {};
    for (const name of query.measures) {
      const pinnedVersionId = query.measureVersions[name];
      if (pinnedVersionId && measures.has(name)) {
        throw new BadRequestException(`Measure '${name}' is a base measure and cannot be version-pinned.`);
      }
      const candidates = formulaRows.rows.filter((row) => row.measure_name === name);
      const selected = pinnedVersionId
        ? candidates.find((row) => row.version_id === pinnedVersionId)
        : candidates.find((row) => row.version_id === row.current_published_version_id);
      if (!selected) {
        if (pinnedVersionId) {
          throw new BadRequestException(`Published version '${pinnedVersionId}' is not available for formula measure '${name}'.`);
        }
        continue;
      }
      const definition = FormulaMeasureDefinitionV1Schema.safeParse(selected.definition);
      if (!definition.success) {
        throw new ServiceUnavailableException(`Published formula measure '${name}' has an invalid stored definition.`);
      }
      measures.set(name, {
        name,
        label: definition.data.displayLabel,
        formulaExpression: definition.data.expression,
        formulaVersionId: selected.version_id,
      });
      resolvedMeasureVersions[name] = selected.version_id;
    }

    let built;
    try {
      built = buildAnalyticsQuery({ datasetVersionId, query, fields, measures });
    } catch (error) {
      if (error instanceof AnalyticsQuerySpecError) throw new BadRequestException(error.message);
      throw error;
    }
    const result = await this.db.queryWithTenant<Record<string, unknown>>(tenantId, built.text, [...built.params]);
    const truncated = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit).map((row) =>
      built.columns.map((column, index) => toCell(row[`c${index}`], column.role === 'measure' ? 'number' : column.type)),
    );
    return {
      semanticModelId: query.semanticModelId,
      datasetVersionId,
      definitionVersion,
      measureVersions: resolvedMeasureVersions,
      asOf,
      freshness,
      watermark,
      columns: [...built.columns],
      rows,
      truncated,
    };
  }

  private async computeFreshness(
    tenantId: string,
    datasetVersionId: string,
    freshnessttlSeconds: number | null,
  ): Promise<{ freshness: FreshnessState; watermark: string | null }> {
    // Check if any BUILDING build is currently running (REBUILDING)
    const buildingResult = await this.db.queryWithTenant<{ count: string }>(
      tenantId,
      `SELECT COUNT(*) AS count
       FROM gigalibs_analytics.analytical_dataset_versions
       WHERE mapping_id = (
           SELECT mapping_id
           FROM gigalibs_analytics.analytical_dataset_versions
           WHERE id = $1
         )
         AND build_status = 'BUILDING'`,
      [datasetVersionId],
    );
    const isRebuilding = Number(buildingResult.rows[0]?.count ?? 0) > 0;

    // Load the dataset version's metadata
    const dvResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT build_status, completed_at, record_count
       FROM gigalibs_analytics.analytical_dataset_versions
       WHERE id = $1`,
      [datasetVersionId],
    );
    if (dvResult.rows.length === 0 || dvResult.rows[0]!.build_status !== 'READY') {
      return { freshness: 'UNAVAILABLE', watermark: null };
    }

    const completedAt: Date = new Date(dvResult.rows[0]!.completed_at);
    const recordCount: number = Number(dvResult.rows[0]!.record_count ?? 0);

    // Check the watermark from the most-recent sync run feeding this dataset's mapping
    const watermarkResult = await this.db.queryWithTenant<{ watermark_value: string | null }>(
      tenantId,
      `SELECT ssr.watermark_value
       FROM gigalibs_analytics.source_sync_runs ssr
       JOIN gigalibs_analytics.analytical_dataset_versions adv ON adv.id = $1
       JOIN gigalibs_analytics.data_studio_mappings dsm ON dsm.id = adv.mapping_id
       WHERE ssr.connection_id = dsm.connection_id
         AND ssr.status = 'SUCCEEDED'
       ORDER BY ssr.completed_at DESC
       LIMIT 1`,
      [datasetVersionId],
    );
    const watermark = watermarkResult.rows[0]?.watermark_value ?? null;

    // Partial: dataset was built but record_count is 0 (interrupted transform)
    if (recordCount === 0 && !isRebuilding) {
      return { freshness: 'PARTIAL', watermark };
    }

    if (isRebuilding) {
      return { freshness: 'REBUILDING', watermark };
    }

    // Stale: dataset older than TTL
    if (freshnessttlSeconds != null) {
      const ageSeconds = (Date.now() - completedAt.getTime()) / 1000;
      if (ageSeconds > freshnessttlSeconds) {
        return { freshness: 'STALE', watermark };
      }
    }

    return { freshness: 'FRESH', watermark };
  }

  // ── Measure aggregation ───────────────────────────────────────────────────

  private async executeMeasure(
    tenantId: string,
    datasetVersionId: string,
    measure: { aggregate_fn: string; field_reference: string; measure_name: string },
    _dimensionOverride?: string,
  ): Promise<number | null> {
    // The aggregate function comes from a closed switch; the JSONB key is always a bound parameter ($2),
    // never SQL text (roadmap rule 4). field_reference is also validated at write time.
    const fn = measure.aggregate_fn;
    let aggregateExpr: string;
    switch (fn) {
      case 'SUM':
        aggregateExpr = `COALESCE(SUM((analytical_payload->>$2::text)::numeric), 0)`;
        break;
      case 'AVG':
        aggregateExpr = `AVG((analytical_payload->>$2::text)::numeric)`;
        break;
      case 'COUNT':
        aggregateExpr = `COUNT(*)`;
        break;
      case 'COUNT_DISTINCT':
        aggregateExpr = `COUNT(DISTINCT analytical_payload->>$2::text)`;
        break;
      case 'MIN':
        aggregateExpr = `MIN((analytical_payload->>$2::text)::numeric)`;
        break;
      case 'MAX':
        aggregateExpr = `MAX((analytical_payload->>$2::text)::numeric)`;
        break;
      default:
        throw new BadRequestException(`Unsupported aggregateFn: '${fn}'.`);
    }
    const params = fn === 'COUNT' ? [datasetVersionId] : [datasetVersionId, measure.field_reference];

    try {
      const result = await this.db.queryWithTenant<{ value: string | null }>(
        tenantId,
        `SELECT ${aggregateExpr} AS value
         FROM gigalibs_analytics.dataset_record_versions
         WHERE dataset_version_id = $1`,
        params,
      );
      const raw = result.rows[0]?.value;
      return raw === null || raw === undefined ? null : Number(raw);
    } catch (err) {
      this.logger.warn(
        `[tenant:${tenantId}] Measure '${measure.measure_name}' query failed: ${err}`,
      );
      return null;
    }
  }

  private unavailableResponse(
    chartDefinitionId: string,
    asOf: string,
    _reason: string,
  ): QueryResponse {
    return {
      chartDefinitionId,
      asOf,
      watermark: null,
      definitionVersion: 0,
      freshness: 'UNAVAILABLE',
      results: [],
      accessibleTable: [],
    };
  }
}

/** Converts a database value to the contract's cell type; numeric and bigint arrive as strings from pg. */
function toCell(value: unknown, type: AnalyticsFieldType): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  switch (type) {
    case 'number': {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    case 'boolean':
      return value === true || value === 'true';
    default:
      return String(value);
  }
}
