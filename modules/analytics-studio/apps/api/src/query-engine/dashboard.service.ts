/**
 * Dashboards (WI-OI-103e): saved chart views plus shared filters. A dashboard stores which filters it offers; the
 * viewer picks values and every chart re-runs its own stored question with the filters its model can take. Each chart
 * reports what applied and what was skipped, and one failing chart never hides the others.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AnalyticsFieldType,
  type AnalyticsFilterV1,
  type ChartViewV1,
  ChartViewV1Schema,
  type DashboardDataV1,
  DashboardDataRequestV1Schema,
  type DashboardFilterValuesV1,
  type DashboardFilterV1,
  type DashboardSummaryV1,
  type DashboardTileDataV1,
  type DashboardV1,
  SaveDashboardV1Schema,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { placeScopeCondition, resolvePlaceScope } from '../places/place-scope.js';
import { loadDatasetFields } from './dataset-fields.js';
import { QueryEngineService } from './query-engine.service.js';
import { SummaryService } from './summary.service.js';

const MAX_FILTER_VALUES = 200;

interface DashboardRow {
  id: string;
  display_name: string;
  description: string | null;
  time_range: boolean;
  shared_filters: unknown;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TileRow {
  id: string;
  chart_view_id: string;
  size: 'small' | 'medium' | 'large';
  name: string;
  description: string | null;
  query_spec: unknown;
  visual_spec: unknown;
  created_by: string;
  created_at: string | Date;
}

type Queryable = Pick<PoolClient, 'query'>;

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queryEngine: QueryEngineService,
    private readonly summaries?: SummaryService,
  ) {}

  async create(principal: AnalyticsPrincipal, input: unknown): Promise<DashboardV1> {
    const dashboard = parse(SaveDashboardV1Schema, input, 'dashboard');
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      await assertChartViews(client, dashboard.tiles.map((tile) => tile.chartViewId));
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.dashboards
           (tenant_id, display_name, description, time_range, shared_filters, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING id`,
        [
          principal.tenantId,
          dashboard.name,
          dashboard.description,
          dashboard.timeRange,
          JSON.stringify(dashboard.filters),
          principal.subject,
        ],
      );
      const id = inserted.rows[0]!.id;
      await writeTiles(client, principal.tenantId, id, dashboard.tiles);
      await audit(client, principal, 'DASHBOARD_CREATED', id, summary(dashboard));
      return readDashboard(client, id);
    }).then((saved) => this.requestSummaries(principal.tenantId, saved));
  }

  /** Replaces the name, filters and tiles in one transaction. */
  async update(principal: AnalyticsPrincipal, id: string, input: unknown): Promise<DashboardV1> {
    const dashboard = parse(SaveDashboardV1Schema, input, 'dashboard');
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const before = await readDashboard(client, id, true);
      await assertChartViews(client, dashboard.tiles.map((tile) => tile.chartViewId));
      await client.query(
        `UPDATE gigalibs_analytics.dashboards
            SET display_name = $2, description = $3, time_range = $4, shared_filters = $5::jsonb
          WHERE id = $1`,
        [id, dashboard.name, dashboard.description, dashboard.timeRange, JSON.stringify(dashboard.filters)],
      );
      await client.query(`DELETE FROM gigalibs_analytics.dashboard_tiles WHERE dashboard_id = $1`, [id]);
      await writeTiles(client, principal.tenantId, id, dashboard.tiles);
      await audit(client, principal, 'DASHBOARD_UPDATED', id, {
        before: { name: before.name, filters: before.filters.map((filter) => filter.field), tiles: before.tiles.map((tile) => tile.chartViewId) },
        after: summary(dashboard),
      });
      return readDashboard(client, id);
    }).then((saved) => this.requestSummaries(principal.tenantId, saved));
  }

  /** Each chart gets a summary covering its question and the dashboard's shared filters (WI-OI-103c). */
  private async requestSummaries(tenantId: string, dashboard: DashboardV1): Promise<DashboardV1> {
    if (this.summaries) {
      const views = await this.db.withTenantTransaction(tenantId, (client) => readTileViews(client, dashboard.id));
      const filterFields = dashboard.filters.map((filter) => filter.field);
      for (const view of views.values()) void this.summaries.ensureForQuestion(tenantId, view.query, filterFields);
    }
    return dashboard;
  }

  async list(principal: AnalyticsPrincipal): Promise<DashboardSummaryV1[]> {
    const result = await this.db.queryWithTenant<{
      id: string;
      display_name: string;
      description: string | null;
      updated_at: string | Date;
      tile_count: string;
    }>(
      principal.tenantId,
      `SELECT d.id, d.display_name, d.description, d.updated_at, count(t.id)::text AS tile_count
         FROM gigalibs_analytics.dashboards d
         LEFT JOIN gigalibs_analytics.dashboard_tiles t ON t.dashboard_id = d.id
        GROUP BY d.id
        ORDER BY d.updated_at DESC, d.id
        LIMIT 200`,
      [],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.display_name,
      description: row.description,
      updatedAt: new Date(row.updated_at).toISOString(),
      tileCount: Number(row.tile_count),
    }));
  }

  async get(principal: AnalyticsPrincipal, id: string): Promise<DashboardV1> {
    return this.db.withTenantTransaction(principal.tenantId, (client) => readDashboard(client, id));
  }

  /** Runs every chart with the viewer's filter values. */
  async data(principal: AnalyticsPrincipal, id: string, input: unknown): Promise<DashboardDataV1> {
    const request = parse(DashboardDataRequestV1Schema, input ?? {}, 'filters');
    const { dashboard, views } = await this.db.withTenantTransaction(principal.tenantId, async (client) => ({
      dashboard: await readDashboard(client, id),
      views: await readTileViews(client, id),
    }));
    const offered = new Map(dashboard.filters.map((filter) => [filter.field, filter] as const));
    for (const filter of request.filters) {
      if (!offered.has(filter.field)) throw new BadRequestException(`'${filter.field}' is not a filter of this dashboard.`);
    }
    if (request.time && !dashboard.timeRange) throw new BadRequestException('This dashboard has no date range filter.');

    const fieldsByModel = new Map<string, Promise<Map<string, AnalyticsFieldType>>>();
    const fieldsOf = (modelId: string) => {
      if (!fieldsByModel.has(modelId)) fieldsByModel.set(modelId, this.modelFields(principal.tenantId, modelId));
      return fieldsByModel.get(modelId)!;
    };

    const tiles = await Promise.all(
      dashboard.tiles.map(async (tile): Promise<DashboardTileDataV1> => {
        const view = views.get(tile.chartViewId)!;
        const applied: string[] = [];
        const skipped: DashboardTileDataV1['skipped'] = [];
        const extra: AnalyticsFilterV1[] = [];
        try {
          const fields = await fieldsOf(view.query.semanticModelId);
          if (request.time) {
            if (view.query.time) {
              extra.push({ field: view.query.time.field, op: 'between', from: request.time.from, to: request.time.to });
              applied.push('Date range');
            } else {
              skipped.push({ filter: 'Date range', reason: 'This chart has no time axis.' });
            }
          }
          for (const filter of request.filters) {
            const label = offered.get(filter.field)!.label;
            if (fields.has(filter.field)) {
              extra.push({ field: filter.field, op: 'in', values: filter.values });
              applied.push(label);
            } else {
              skipped.push({ filter: label, reason: `This chart's model has no '${filter.field}' field.` });
            }
          }
          const result = await this.queryEngine.runSpec(principal, { ...view.query, filters: [...view.query.filters, ...extra] });
          return { ...tile, applied, skipped, result, error: null };
        } catch (error) {
          return { ...tile, applied, skipped, result: null, error: error instanceof Error ? error.message : 'This chart could not be drawn.' };
        }
      }),
    );
    return { dashboardId: dashboard.id, tiles, generatedAt: new Date().toISOString() };
  }

  /** Distinct values of one shared filter across the models of the dashboard's charts that have that field. */
  async filterValues(principal: AnalyticsPrincipal, id: string, field: string): Promise<DashboardFilterValuesV1> {
    const { dashboard, views } = await this.db.withTenantTransaction(principal.tenantId, async (client) => ({
      dashboard: await readDashboard(client, id),
      views: await readTileViews(client, id),
    }));
    if (!dashboard.filters.some((filter) => filter.field === field)) {
      throw new BadRequestException(`'${field}' is not a filter of this dashboard.`);
    }
    // WI-OI-105d: a member with a place scope is offered only values from records under their places.
    const placeScope = await resolvePlaceScope(this.db, principal);
    const datasetVersions: string[] = [];
    let type: AnalyticsFieldType | undefined;
    for (const modelId of new Set([...views.values()].map((view) => view.query.semanticModelId))) {
      const datasetVersionId = await this.datasetVersionOf(principal.tenantId, modelId);
      const fields = await loadDatasetFields(this.db, principal.tenantId, datasetVersionId);
      if (!fields.has(field) || (placeScope && !fields.has('place_id'))) continue;
      datasetVersions.push(datasetVersionId);
      type ??= fields.get(field);
    }
    if (datasetVersions.length === 0) return { field, values: [], truncated: false };
    const params: unknown[] = [field, datasetVersions];
    const scoped = placeScope
      ? ` AND ${placeScopeCondition('', placeScope, (value) => `$${params.push(value)}`)}`
      : '';
    const result = await this.db.queryWithTenant<{ value: string }>(
      principal.tenantId,
      `SELECT DISTINCT analytical_payload->>$1 AS value
         FROM gigalibs_analytics.dataset_record_versions
        WHERE dataset_version_id = ANY($2::uuid[]) AND analytical_payload->>$1 IS NOT NULL${scoped}
        ORDER BY 1
        LIMIT ${MAX_FILTER_VALUES + 1}`,
      params,
    );
    const values = result.rows.slice(0, MAX_FILTER_VALUES).map((row) => typed(row.value, type));
    return { field, values, truncated: result.rows.length > MAX_FILTER_VALUES };
  }

  private async modelFields(tenantId: string, modelId: string): Promise<Map<string, AnalyticsFieldType>> {
    return loadDatasetFields(this.db, tenantId, await this.datasetVersionOf(tenantId, modelId));
  }

  private async datasetVersionOf(tenantId: string, modelId: string): Promise<string> {
    const result = await this.db.queryWithTenant<{ dataset_version_id: string }>(
      tenantId,
      `SELECT dataset_version_id FROM gigalibs_analytics.semantic_models WHERE id = $1`,
      [modelId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException(`Semantic model '${modelId}' not found.`);
    return row.dataset_version_id;
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(`Invalid ${what}: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
  }
  return parsed.data;
}

async function assertChartViews(client: Queryable, ids: string[]): Promise<void> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM gigalibs_analytics.chart_views WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const known = new Set(found.rows.map((row) => row.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) throw new NotFoundException(`Saved chart '${missing[0]}' not found.`);
}

async function writeTiles(
  client: Queryable,
  tenantId: string,
  dashboardId: string,
  tiles: ReadonlyArray<{ chartViewId: string; size: 'small' | 'medium' | 'large' }>,
): Promise<void> {
  const values: unknown[] = [];
  const rows = tiles.map((tile, position) => {
    const p = position * 5;
    values.push(tenantId, dashboardId, tile.chartViewId, position, tile.size);
    return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5})`;
  });
  await client.query(
    `INSERT INTO gigalibs_analytics.dashboard_tiles (tenant_id, dashboard_id, chart_view_id, position, size)
     VALUES ${rows.join(', ')}`,
    values,
  );
}

async function readDashboard(client: Queryable, id: string, forUpdate = false): Promise<DashboardV1> {
  const result = await client.query<DashboardRow>(
    `SELECT id, display_name, description, time_range, shared_filters, created_by, created_at, updated_at
       FROM gigalibs_analytics.dashboards WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundException(`Dashboard '${id}' not found.`);
  const tiles = await client.query<TileRow>(
    `SELECT t.id, t.chart_view_id, t.size, v.name, v.description, v.query_spec, v.visual_spec, v.created_by, v.created_at
       FROM gigalibs_analytics.dashboard_tiles t
       JOIN gigalibs_analytics.chart_views v ON v.id = t.chart_view_id
      WHERE t.dashboard_id = $1
      ORDER BY t.position`,
    [id],
  );
  const filters = (typeof row.shared_filters === 'string' ? JSON.parse(row.shared_filters) : row.shared_filters) as DashboardFilterV1[];
  return {
    id: row.id,
    name: row.display_name,
    description: row.description,
    timeRange: row.time_range,
    filters,
    tiles: tiles.rows.map((tile) => ({
      id: tile.id,
      chartViewId: tile.chart_view_id,
      name: tile.name,
      chartType: toView(tile).visual.type,
      size: tile.size,
    })),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function readTileViews(client: Queryable, dashboardId: string): Promise<Map<string, ChartViewV1>> {
  const result = await client.query<TileRow>(
    `SELECT t.id, t.chart_view_id, t.size, v.name, v.description, v.query_spec, v.visual_spec, v.created_by, v.created_at
       FROM gigalibs_analytics.dashboard_tiles t
       JOIN gigalibs_analytics.chart_views v ON v.id = t.chart_view_id
      WHERE t.dashboard_id = $1`,
    [dashboardId],
  );
  return new Map(result.rows.map((row) => [row.chart_view_id, toView(row)] as const));
}

function toView(row: TileRow): ChartViewV1 {
  return ChartViewV1Schema.parse({
    id: row.chart_view_id,
    name: row.name,
    description: row.description,
    query: typeof row.query_spec === 'string' ? JSON.parse(row.query_spec) : row.query_spec,
    visual: typeof row.visual_spec === 'string' ? JSON.parse(row.visual_spec) : row.visual_spec,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function summary(dashboard: z.output<typeof SaveDashboardV1Schema>) {
  return {
    name: dashboard.name,
    timeRange: dashboard.timeRange,
    filters: dashboard.filters.map((filter) => filter.field),
    tiles: dashboard.tiles.map((tile) => tile.chartViewId),
  };
}

async function audit(
  client: Queryable,
  principal: AnalyticsPrincipal,
  event: 'DASHBOARD_CREATED' | 'DASHBOARD_UPDATED',
  dashboardId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_analytics.analytics_audit_log
       (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
     VALUES ($1, $2::gigalibs_analytics.audit_event_type, $3, $4, 'DASHBOARD', $5::jsonb)`,
    [principal.tenantId, event, principal.subject, dashboardId, JSON.stringify(payload)],
  );
}

function typed(value: string, type: AnalyticsFieldType | undefined): string | number | boolean {
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (type === 'boolean') return value === 'true';
  return value;
}
