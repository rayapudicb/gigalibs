import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { DashboardService } from './dashboard.service.js';
import type { QueryEngineService } from './query-engine.service.js';

const principal: AnalyticsPrincipal = Object.freeze({
  tenantId: 'tenant-a',
  subject: 'analyst-1',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['analytics:read', 'analytics:dashboards:write'],
  roles: ['MEMBER'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});

const DASHBOARD = '00000000-0000-4000-8000-0000000000d1';
const VIEW_FARM = '00000000-0000-4000-8000-0000000000a1';
const VIEW_REGION = '00000000-0000-4000-8000-0000000000a2';
const MODEL_FARM = '00000000-0000-4000-8000-0000000000b1';
const MODEL_REGION = '00000000-0000-4000-8000-0000000000b2';

const views = {
  [VIEW_FARM]: {
    name: 'Yield by month',
    query: { semanticModelId: MODEL_FARM, measures: ['total_yield_kg'], dimensions: [], time: { field: 'harvest_date', grain: 'month' }, filters: [], sort: [], limit: 1000 },
    visual: { type: 'line' },
  },
  [VIEW_REGION]: {
    name: 'Cost by region',
    query: { semanticModelId: MODEL_REGION, measures: ['cost'], dimensions: ['region'], filters: [{ field: 'region', op: 'neq', value: 'X' }], sort: [], limit: 1000 },
    visual: { type: 'bar' },
  },
} as const;

const FIELDS: Record<string, Array<{ analyticalField: string; analyticalType: string }>> = {
  'dv-farm': [
    { analyticalField: 'farm', analyticalType: 'string' },
    { analyticalField: 'harvest_date', analyticalType: 'date' },
    { analyticalField: 'area_ha', analyticalType: 'number' },
  ],
  'dv-region': [{ analyticalField: 'region', analyticalType: 'string' }],
};

const tileRow = (viewId: keyof typeof views, size: string, id: string) => ({
  id,
  chart_view_id: viewId,
  size,
  name: views[viewId].name,
  description: null,
  query_spec: views[viewId].query,
  visual_spec: views[viewId].visual,
  created_by: 'maker',
  created_at: '2026-09-29T00:00:00Z',
});

describe('DashboardService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let db: { queryWithTenant: ReturnType<typeof vi.fn>; withTenantTransaction: ReturnType<typeof vi.fn> };
  let runSpec: ReturnType<typeof vi.fn>;
  let service: DashboardService;
  let dashboardRow: Record<string, unknown>;

  beforeEach(() => {
    dashboardRow = {
      id: DASHBOARD,
      display_name: 'Farm overview',
      description: null,
      time_range: true,
      shared_filters: [{ field: 'farm', label: 'Farm' }],
      created_by: 'analyst-1',
      created_at: '2026-09-29T00:00:00Z',
      updated_at: '2026-09-29T00:00:00Z',
    };
    client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM gigalibs_analytics.chart_views WHERE id = ANY')) {
          return { rows: (params[0] as string[]).filter((id) => id in views).map((id) => ({ id })) };
        }
        if (sql.includes('INSERT INTO gigalibs_analytics.dashboards')) return { rows: [{ id: DASHBOARD }] };
        if (sql.includes('FROM gigalibs_analytics.dashboards WHERE id')) return { rows: [dashboardRow] };
        if (sql.includes('FROM gigalibs_analytics.dashboard_tiles t')) {
          return { rows: [tileRow(VIEW_FARM, 'medium', 'tile-1'), tileRow(VIEW_REGION, 'small', 'tile-2')] };
        }
        return { rows: [] };
      }),
    };
    db = {
      queryWithTenant: vi.fn(async (_tenant: string, sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM gigalibs_analytics.semantic_models WHERE id')) {
          return { rows: [{ dataset_version_id: params[0] === MODEL_FARM ? 'dv-farm' : 'dv-region' }] };
        }
        if (sql.includes('studio_mapping_versions')) return { rows: [{ field_mappings: FIELDS[params[0] as string] }] };
        if (sql.includes('SELECT DISTINCT analytical_payload')) {
          return { rows: [{ value: 'Sample Farm Hill' }, { value: 'Sample Farm North' }] };
        }
        return { rows: [] };
      }),
      withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) => callback(client)),
    };
    runSpec = vi.fn(async () => ({ columns: [], rows: [] }));
    service = new DashboardService(db as unknown as DatabaseService, { runSpec } as unknown as QueryEngineService);
  });

  const statements = () => client.query.mock.calls.map(([sql]) => String(sql));

  it('saves a dashboard, its ordered tiles and an audit event in one transaction', async () => {
    const saved = await service.create(principal, {
      name: 'Farm overview',
      filters: [{ field: 'farm', label: 'Farm' }],
      tiles: [{ chartViewId: VIEW_FARM }, { chartViewId: VIEW_REGION, size: 'small' }],
    });
    expect(db.withTenantTransaction).toHaveBeenCalledTimes(1);
    const tileInsert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO gigalibs_analytics.dashboard_tiles'))!;
    expect(tileInsert[1]).toEqual(['tenant-a', DASHBOARD, VIEW_FARM, 0, 'medium', 'tenant-a', DASHBOARD, VIEW_REGION, 1, 'small']);
    expect(statements().some((sql) => sql.includes("'DASHBOARD'"))).toBe(true);
    expect(client.query.mock.calls.find(([sql]) => String(sql).includes('analytics_audit_log'))![1]).toContain('DASHBOARD_CREATED');
    expect(saved.tiles.map((tile) => [tile.name, tile.chartType, tile.size])).toEqual([
      ['Yield by month', 'line', 'medium'],
      ['Cost by region', 'bar', 'small'],
    ]);
  });

  it('refuses an unknown saved chart and duplicate filters before writing anything', async () => {
    await expect(
      service.create(principal, { name: 'X', tiles: [{ chartViewId: '00000000-0000-4000-8000-0000000000ff' }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.create(principal, {
        name: 'X',
        filters: [{ field: 'farm', label: 'Farm' }, { field: 'farm', label: 'Again' }],
        tiles: [{ chartViewId: VIEW_FARM }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(statements().some((sql) => sql.includes('INSERT'))).toBe(false);
  });

  it('applies each shared filter only to charts that can take it, and says what was skipped', async () => {
    const data = await service.data(principal, DASHBOARD, {
      time: { from: '2025-01-01', to: '2025-12-31' },
      filters: [{ field: 'farm', values: ['Sample Farm North'] }],
    });
    const farmTile = data.tiles.find((tile) => tile.chartViewId === VIEW_FARM)!;
    const regionTile = data.tiles.find((tile) => tile.chartViewId === VIEW_REGION)!;
    expect(farmTile.applied).toEqual(['Date range', 'Farm']);
    expect(farmTile.skipped).toEqual([]);
    expect(regionTile.applied).toEqual([]);
    expect(regionTile.skipped).toEqual([
      { filter: 'Date range', reason: 'This chart has no time axis.' },
      { filter: 'Farm', reason: "This chart's model has no 'farm' field." },
    ]);
    const farmQuery = runSpec.mock.calls.find(([, query]) => query.semanticModelId === MODEL_FARM)![1];
    expect(farmQuery.filters).toEqual([
      { field: 'harvest_date', op: 'between', from: '2025-01-01', to: '2025-12-31' },
      { field: 'farm', op: 'in', values: ['Sample Farm North'] },
    ]);
    const regionQuery = runSpec.mock.calls.find(([, query]) => query.semanticModelId === MODEL_REGION)![1];
    expect(regionQuery.filters).toEqual(views[VIEW_REGION].query.filters);
  });

  it('keeps drawing the other charts when one fails', async () => {
    runSpec.mockImplementation(async (_principal: unknown, query: { semanticModelId: string }) => {
      if (query.semanticModelId === MODEL_REGION) throw new Error('Formula version is no longer published.');
      return { columns: [], rows: [] };
    });
    const data = await service.data(principal, DASHBOARD, {});
    expect(data.tiles.map((tile) => tile.error)).toEqual([null, 'Formula version is no longer published.']);
    expect(data.tiles[0]!.result).not.toBeNull();
  });

  it('refuses filter values the dashboard does not offer', async () => {
    await expect(service.data(principal, DASHBOARD, { filters: [{ field: 'crop', values: ['Rice'] }] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    dashboardRow.time_range = false;
    await expect(service.data(principal, DASHBOARD, { time: { from: '2025-01-01', to: '2025-02-01' } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.filterValues(principal, DASHBOARD, 'crop')).rejects.toBeInstanceOf(BadRequestException);
    expect(runSpec).not.toHaveBeenCalled();
  });

  it('lists filter values only from the models that have the field', async () => {
    const values = await service.filterValues(principal, DASHBOARD, 'farm');
    expect(values).toEqual({ field: 'farm', values: ['Sample Farm Hill', 'Sample Farm North'], truncated: false });
    const distinct = db.queryWithTenant.mock.calls.find(([, sql]) => String(sql).includes('SELECT DISTINCT'))!;
    expect(distinct[2]).toEqual(['farm', ['dv-farm']]);
  });

  it('replaces the tiles on update and audits before and after', async () => {
    await service.update(principal, DASHBOARD, { name: 'Renamed', tiles: [{ chartViewId: VIEW_REGION, size: 'large' }] });
    const sql = statements();
    expect(sql.findIndex((text) => text.includes('FOR UPDATE'))).toBeLessThan(sql.findIndex((text) => text.includes('DELETE FROM')));
    expect(sql.findIndex((text) => text.includes('DELETE FROM gigalibs_analytics.dashboard_tiles'))).toBeLessThan(
      sql.findIndex((text) => text.includes('INSERT INTO gigalibs_analytics.dashboard_tiles')),
    );
    const audit = client.query.mock.calls.find(([text]) => String(text).includes('analytics_audit_log'))!;
    expect(audit[1][1]).toBe('DASHBOARD_UPDATED');
    expect(JSON.parse(audit[1][4] as string)).toMatchObject({
      before: { name: 'Farm overview', tiles: [VIEW_FARM, VIEW_REGION] },
      after: { name: 'Renamed', tiles: [VIEW_REGION] },
    });
  });
});
