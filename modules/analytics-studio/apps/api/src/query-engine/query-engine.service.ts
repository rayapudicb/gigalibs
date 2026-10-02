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
import { AnswerCache } from './answer-cache.js';
import { loadDatasetFields } from './dataset-fields.js';
import { AnalyticsQuerySpecError, buildAnalyticsQuery, type QueryMeasure } from './query-builder.js';
import { chooseSummary } from './summary-plan.js';
import { SummaryService } from './summary.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { assertPlacedDataset, placeScopeCondition, placesUnder, resolvePlaceScope, type PlaceScope } from '../places/place-scope.js';
import { organizationFilters, resolveOrganizationAccess } from '../organization/organization-scope.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FreshnessState = 'FRESH' | 'STALE' | 'PARTIAL' | 'REBUILDING' | 'UNAVAILABLE';
// NOTE: 'UNAUTHORIZED' is NOT a FreshnessState. Authorization failures
//       surface as HTTP 403 from PlatformContextAuthorizationGuard, not as a data signal.

/** Freshness window for ad-hoc query specs; saved charts carry their own (WI-OI-103d). */
export const SPEC_FRESHNESS_TTL_SECONDS = 3600;

/** Longest a single Analytics question may run (WI-OI-103c); a slower one is refused with advice, not queued. */
export const SPEC_STATEMENT_TIMEOUT_MS = 15_000;

// ─── QueryEngineService ───────────────────────────────────────────────────────

@Injectable()
export class QueryEngineService {
  private readonly logger = new Logger(QueryEngineService.name);

  private readonly answers = new AnswerCache();

  constructor(
    private readonly db: DatabaseService,
    private readonly summaries?: SummaryService,
  ) {}

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
    // WI-OI-105d (D2, D3): a member with a place scope sees only records under their places, from the rows.
    const memberScope = await resolvePlaceScope(this.db, principal);
    assertPlacedDataset(memberScope, fields);
    // WI-OI-105e: a question about one place (a farm) keeps the records under it, within the member's scope.
    let placeScope = memberScope;
    if (query.placeUnder) {
      if (!fields.has('place_id')) throw new BadRequestException('This dataset has no places to filter by.');
      const under = await placesUnder(this.db, tenantId, query.placeUnder);
      const visible = memberScope ? new Set(memberScope.placeIds) : null;
      placeScope = { placeIds: visible ? under.filter((id) => visible.has(id)) : under, paths: [] };
    }
    // WI-OI-109e3: a member of an organization-scoped tenant sees their units' records and shared ones.
    const memberAccess = await resolveOrganizationAccess(this.db, principal);
    const unitScope = organizationFilters(memberAccess, fields) ? memberAccess : null;
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

    const cacheKey = AnswerCache.key({
      tenantId,
      datasetVersionId,
      definitionVersion,
      query,
      measureVersions: resolvedMeasureVersions,
      // The visible places, not the assignment: a place moved in or out of a farm changes the answer.
      spatialScope: placeScope ? [...placeScope.placeIds].sort() : null,
      // The visible units, not the grants: a reorganised tree changes the answer.
      organizationScope: unitScope ? (unitScope.denied ? 'DENIED' : [...(unitScope.readUnits ?? [])].sort()) : null,
    });
    const cached = this.answers.get(cacheKey);
    // The answer cannot change for this dataset version; freshness is about now, so it is recomputed above.
    if (cached) return { ...cached, freshness, watermark };

    // A READY summary that answers the question exactly is used instead of the raw rows (WI-OI-103c).
    const summary = this.summaries && !placeScope && !unitScope
      ? chooseSummary(await this.summaries.ready(tenantId, datasetVersionId), query, measures, fields)
      : undefined;
    let built;
    try {
      built = buildAnalyticsQuery({
        datasetVersionId,
        query,
        fields,
        measures,
        ...(summary
          ? { summary: { id: summary.id, dimensions: summary.dimensions, timeField: summary.timeField, numericFields: summary.numericFields } }
          : {}),
        ...(placeScope ? { placeScope } : {}),
        ...(unitScope ? { organizationScope: unitScope } : {}),
      });
    } catch (error) {
      if (error instanceof AnalyticsQuerySpecError) throw new BadRequestException(error.message);
      throw error;
    }
    const result = await this.runLimited(tenantId, built.text, [...built.params]);
    const truncated = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit).map((row) =>
      built.columns.map((column, index) => toCell(row[`c${index}`], column.role === 'measure' ? 'number' : column.type)),
    );
    const answer: AnalyticsQueryResultV1 = {
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
      answeredFrom: summary ? 'summary' : 'rows',
    };
    this.answers.set(cacheKey, answer);
    return answer;
  }

  /** Runs one question under the statement time limit; a timeout becomes advice instead of a stuck connection. */
  private async runLimited(tenantId: string, text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    try {
      return await this.db.withTenantTransaction(tenantId, async (client) => {
        await client.query('SELECT set_config($1, $2, true)', ['statement_timeout', String(SPEC_STATEMENT_TIMEOUT_MS)]);
        return client.query<Record<string, unknown>>(text, params);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '57014') {
        throw new BadRequestException(
          `This question took longer than ${SPEC_STATEMENT_TIMEOUT_MS / 1000} seconds. Narrow it with a filter or a shorter date range, or save it in a chart or dashboard so a summary is built for it.`,
        );
      }
      throw error;
    }
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
