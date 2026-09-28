/**
 * Phase 5 — Query Engine + Charts + Dashboards
 *
 * Test categories:
 *  1. Migration 000008 schema assertions
 *  2. QueryEngineService — freshness state machine (all 5 governed states)
 *  3. QueryEngineService — UNAUTHORIZED is never a freshness state (gov rule)
 *  4. QueryEngineService — tenant isolation
 *  5. ChartService — ECharts option builder (data from query, not template)
 *  6. ChartService — accessible table present on every chart type
 *  7. DashboardService — layout join table assertions
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';

const jest = vi;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../db/migrations/000008_charts_and_dashboards.up.sql',
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_FILE, 'utf8');
}

// ─── 1. Migration 000008 schema assertions ───────────────────────────────────

describe('Migration 000008 — schema assertions', () => {
  let sql: string;
  beforeAll(() => { sql = readMigration(); });

  test('creates chart_type enum', () => {
    expect(sql).toMatch(/CREATE TYPE.*chart_type.*AS ENUM/s);
  });

  test('chart_type enum includes all 9 types', () => {
    const types = ['BAR', 'LINE', 'PIE', 'SCATTER', 'AREA', 'HEATMAP', 'TREEMAP', 'FUNNEL', 'GAUGE'];
    for (const t of types) expect(sql).toContain(`'${t}'`);
  });

  test('creates freshness_state enum with exactly 5 states', () => {
    expect(sql).toMatch(/CREATE TYPE.*freshness_state.*AS ENUM/s);
    const states = ['FRESH', 'STALE', 'PARTIAL', 'REBUILDING', 'UNAVAILABLE'];
    for (const s of states) expect(sql).toContain(`'${s}'`);
  });

  test('UNAUTHORIZED is NOT in freshness_state enum', () => {
    // Governance rule: UNAUTHORIZED is an HTTP auth concept, not a freshness signal
    const enumBlock = sql.match(/freshness_state.*?AS ENUM\s*\((.*?)\)/s)?.[1] ?? '';
    expect(enumBlock.replace(/--.*$/gm, '')).not.toMatch(/['"]UNAUTHORIZED['"]/);
  });

  test('creates chart_definitions table', () => {
    expect(sql).toMatch(/CREATE TABLE.*chart_definitions/s);
  });

  test('chart_definitions has RLS + FORCE RLS', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY.*chart_definitions|chart_definitions.*ENABLE ROW LEVEL SECURITY/s);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY.*chart_definitions|chart_definitions.*FORCE ROW LEVEL SECURITY/s);
  });

  test('creates dashboards table', () => {
    expect(sql).toMatch(/CREATE TABLE.*dashboards/s);
  });

  test('creates dashboard_charts join table with UNIQUE(dashboard_id, chart_definition_id)', () => {
    expect(sql).toMatch(/CREATE TABLE.*dashboard_charts/s);
    expect(sql).toMatch(/UNIQUE.*dashboard_id.*chart_definition_id/s);
  });

  test('creates dashboard_filters table', () => {
    expect(sql).toMatch(/CREATE TABLE.*dashboard_filters/s);
  });

  test('dashboard_filters operator CHECK includes all operators', () => {
    const ops = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'BETWEEN', 'LIKE'];
    for (const op of ops) expect(sql).toContain(`'${op}'`);
  });

  test('creates query_result_cache table with expiry index', () => {
    expect(sql).toMatch(/CREATE TABLE.*query_result_cache/s);
    expect(sql).toMatch(/idx_qrc_chart_tenant_expires/s);
  });

  test('schema_migrations ledger records version 8', () => {
    expect(sql).toMatch(/INSERT INTO.*schema_migrations.*version.*8/s);
  });
});

// ─── 2. QueryEngineService — freshness state machine ──────────────────────────

import { QueryEngineService } from './query-engine.service.js';

const PRINCIPAL = { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']) };

function mockDbForFreshness(opts: {
  buildingCount: number;
  buildStatus: string;
  recordCount: number;
  completedOffsetSeconds: number;
  freshnessttl: number | null;
  watermark?: string | null;
}) {
  let callCount = 0;
  return {
    queryWithTenant: jest.fn().mockImplementation((_t: string, sql: string) => {
      callCount++;
      // Chart definition lookup
      if (sql.includes('chart_definitions')) {
        return Promise.resolve({
          rows: [{
            id: 'cd-1', semantic_model_id: 'sm-1',
            measure_names: ['rev'], dimension_field: null,
            freshness_ttl_seconds: opts.freshnessttl, chart_type: 'BAR',
          }],
        });
      }
      // Model + measures lookup
      if (sql.includes('semantic_models') && sql.includes('semantic_model_versions')) {
        return Promise.resolve({
          rows: [{
            id: 'sm-1', dataset_version_id: 'dv-1',
            display_name: 'Sales', version_number: 1,
            measure_name: 'total_revenue', aggregate_fn: 'SUM',
            field_reference: 'revenue', display_label: 'Revenue',
          }],
        });
      }
      // Building count
      if (sql.includes("build_status = 'BUILDING'")) {
        return Promise.resolve({ rows: [{ count: String(opts.buildingCount) }] });
      }
      // Dataset version
      if (sql.includes('analytical_dataset_versions') && sql.includes('completed_at')) {
        const completedAt = new Date(Date.now() - opts.completedOffsetSeconds * 1000).toISOString();
        return Promise.resolve({
          rows: [{
            build_status: opts.buildStatus,
            completed_at: completedAt,
            record_count: String(opts.recordCount),
          }],
        });
      }
      // Watermark
      if (sql.includes('source_sync_runs')) {
        return Promise.resolve({ rows: [{ watermark_value: opts.watermark ?? null }] });
      }
      // Measure execution
      if (sql.includes('dataset_record_versions') && sql.includes('SELECT')) {
        return Promise.resolve({ rows: [{ value: '42' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    withTenantTransaction: jest.fn(),
  };
}

describe('QueryEngineService — freshness state machine', () => {
  test('FRESH when dataset is READY and within TTL', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 10, completedOffsetSeconds: 60, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('FRESH');
  });

  test('STALE when dataset exceeds TTL', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 10, completedOffsetSeconds: 7200, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('STALE');
  });

  test('REBUILDING when a BUILDING version exists in parallel', async () => {
    const db = mockDbForFreshness({ buildingCount: 1, buildStatus: 'READY', recordCount: 10, completedOffsetSeconds: 60, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('REBUILDING');
  });

  test('PARTIAL when READY dataset has 0 records', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 0, completedOffsetSeconds: 60, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('PARTIAL');
  });

  test('UNAVAILABLE when no READY dataset version found', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'FAILED', recordCount: 0, completedOffsetSeconds: 0, freshnessttl: null });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('UNAVAILABLE');
  });

  test('FRESH when no TTL configured (no expiry check)', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 5, completedOffsetSeconds: 999999, freshnessttl: null });
    const svc = new QueryEngineService(db as any);
    const result = await svc.runQuery(PRINCIPAL, { chartDefinitionId: 'cd-1' });
    expect(result.freshness).toBe('FRESH');
  });
});

// ─── 3. UNAUTHORIZED is NEVER a freshness state ───────────────────────────────

describe('QueryEngineService — governance: UNAUTHORIZED is not a freshness state', () => {
  test('FreshnessState type does not include UNAUTHORIZED (source code audit)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'query-engine.service.ts'), 'utf8');
    // Confirm the governed type definition
    const typeMatch = src.match(/type FreshnessState = (.*?);/);
    expect(typeMatch).not.toBeNull();
    const typeExpr = typeMatch![1]!;
    expect(typeExpr).not.toContain('UNAUTHORIZED');
    // Confirm the enum comment states the rule
    expect(src).toContain('UNAUTHORIZED is never a freshness state');
  });

  test('migration freshness_state enum does not contain UNAUTHORIZED', () => {
    const sql = readMigration();
    const enumBlock = sql.match(/freshness_state.*?AS ENUM\s*\((.*?)\)/s)?.[1] ?? '';
    expect(enumBlock.replace(/--.*$/gm, '')).not.toMatch(/['"]UNAUTHORIZED['"]/);
    // Confirm migration comment
    expect(sql).toContain("'UNAUTHORIZED' is never a freshness state");
  });

  test('response never sets freshness=UNAUTHORIZED in any code path', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'query-engine.service.ts'), 'utf8');
    // The string 'UNAUTHORIZED' should only appear in comments, not as an assigned value
    const assignMatches = src.match(/freshness:\s*['"`]UNAUTHORIZED['"`]/g) ?? [];
    expect(assignMatches).toHaveLength(0);
  });
});

// ─── 4. Tenant isolation ──────────────────────────────────────────────────────

describe('QueryEngineService — tenant isolation', () => {
  test('runQuery throws NotFoundException for chart not belonging to tenant', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new QueryEngineService(db as any);
    await expect(svc.runQuery(
      { tenantId: 'tenant-B', subject: 'u', entitlements: new Set(['analytics-studio']) },
      { chartDefinitionId: 'cd-tenant-A' },
    )).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });
});

// ─── 5. ChartService — ECharts option builder ─────────────────────────────────

import { ChartService } from './chart.service.js';

const QUERY_RESPONSE = {
  chartDefinitionId: 'cd-1', asOf: '2026-01-01T00:00:00.000Z',
  watermark: 'wm-1', definitionVersion: 1, freshness: 'FRESH' as const,
  results: [
    { measureName: 'total_revenue', aggregateFn: 'SUM', fieldReference: 'revenue', displayLabel: 'Revenue', value: 100 },
    { measureName: 'count_orders', aggregateFn: 'COUNT', fieldReference: '*', displayLabel: 'Orders', value: 25 },
  ],
  accessibleTable: [
    { label: 'Revenue', value: '100' },
    { label: 'Orders', value: '25' },
  ],
};

describe('ChartService — ECharts option builder', () => {
  function buildOption(chartType: string) {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({
        rows: [{ id: 'cd-1', display_name: 'Sales', chart_type: chartType, measure_names: ['total_revenue'], dimension_field: null, chart_options_template: {} }],
      }),
      withTenantTransaction: jest.fn(),
    };
    const qeSvc = {
      runQuery: jest.fn().mockResolvedValue(QUERY_RESPONSE),
    };
    const svc = new ChartService(db as any, qeSvc as any);
    return svc.renderChart(PRINCIPAL, 'cd-1');
  }

  test('BAR chart produces xAxis + series[type=bar]', async () => {
    const result = await buildOption('BAR');
    expect(result.echartsOption.xAxis).toBeDefined();
    expect(result.echartsOption.series![0]!.type).toBe('bar');
  });

  test('LINE chart produces series[type=line]', async () => {
    const result = await buildOption('LINE');
    expect(result.echartsOption.series![0]!.type).toBe('line');
  });

  test('PIE chart produces series[type=pie] with named data', async () => {
    const result = await buildOption('PIE');
    expect(result.echartsOption.series![0]!.type).toBe('pie');
    const data = result.echartsOption.series![0]!.data as Array<{ name: string; value: number }>;
    expect(data[0]!.name).toBe('Revenue');
    expect(data[0]!.value).toBe(100);
  });

  test('series data comes from query results, not from chart_options_template', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({
        rows: [{
          id: 'cd-1', display_name: 'Sales', chart_type: 'BAR',
          measure_names: ['total_revenue'], dimension_field: null,
          // Template has data — should be IGNORED
          chart_options_template: { series: [{ type: 'bar', data: [9999, 9999, 9999] }] },
        }],
      }),
      withTenantTransaction: jest.fn(),
    };
    const qeSvc = { runQuery: jest.fn().mockResolvedValue(QUERY_RESPONSE) };
    const svc = new ChartService(db as any, qeSvc as any);
    const result = await svc.renderChart(PRINCIPAL, 'cd-1');
    // Data must be the query result values [100, 25], not [9999, 9999, 9999]
    const seriesData = result.echartsOption.series![0]!.data as number[];
    expect(seriesData).toContain(100);
    expect(seriesData).toContain(25);
    expect(seriesData).not.toContain(9999);
  });

  test('GAUGE chart produces series[type=gauge]', async () => {
    const result = await buildOption('GAUGE');
    expect(result.echartsOption.series![0]!.type).toBe('gauge');
  });

  test('FUNNEL chart produces series[type=funnel]', async () => {
    const result = await buildOption('FUNNEL');
    expect(result.echartsOption.series![0]!.type).toBe('funnel');
  });

  test('title subtext includes freshness state', async () => {
    const result = await buildOption('BAR');
    expect((result.echartsOption.title as any)?.subtext).toContain('FRESH');
  });
});

// ─── 6. Accessible table on every chart type ─────────────────────────────────

describe('ChartService — accessible table present on every chart type', () => {
  const CHART_TYPES = ['BAR', 'LINE', 'PIE', 'SCATTER', 'AREA', 'GAUGE', 'FUNNEL', 'TREEMAP', 'HEATMAP'];

  for (const chartType of CHART_TYPES) {
    test(`${chartType} chart returns non-empty accessibleTable`, async () => {
      const db = {
        queryWithTenant: jest.fn().mockResolvedValue({
          rows: [{ id: 'cd-1', display_name: 'X', chart_type: chartType, measure_names: ['m1'], dimension_field: null, chart_options_template: {} }],
        }),
        withTenantTransaction: jest.fn(),
      };
      const qeSvc = { runQuery: jest.fn().mockResolvedValue(QUERY_RESPONSE) };
      const svc = new ChartService(db as any, qeSvc as any);
      const result = await svc.renderChart(PRINCIPAL, 'cd-1');
      expect(result.accessibleTable.length).toBeGreaterThan(0);
      expect(typeof result.accessibleTable[0]!.label).toBe('string');
    });
  }
});

// ─── 7. Dashboard layout join table ───────────────────────────────────────────

import { DashboardService } from './dashboard.service.js';

describe('DashboardService — layout join table', () => {
  test('addChartToDashboard throws NotFoundException for unknown dashboard', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new DashboardService(db as any);
    await expect(svc.addChartToDashboard(
      PRINCIPAL, 'dashboard-nonexistent', { chartDefinitionId: 'cd-1' },
    )).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });

  test('getDashboard returns chart list ordered by sort_order', async () => {
    const db = {
      queryWithTenant: jest.fn().mockImplementation((_t: string, sql: string) => {
        if (sql.includes('FROM gigalibs_analytics.dashboards WHERE')) {
          return Promise.resolve({
            rows: [{ id: 'dash-1', tenant_id: 'T', display_name: 'Main', description: null, created_by: 'u', created_at: '2026-01-01' }],
          });
        }
        if (sql.includes('dashboard_charts')) {
          return Promise.resolve({
            rows: [
              { id: 'dc-1', chart_definition_id: 'cd-1', grid_col: 0, grid_row: 0, col_span: 6, row_span: 4, chart_type: 'BAR', display_name: 'Revenue' },
              { id: 'dc-2', chart_definition_id: 'cd-2', grid_col: 6, grid_row: 0, col_span: 6, row_span: 4, chart_type: 'LINE', display_name: 'Orders' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new DashboardService(db as any);
    const result = await svc.getDashboard(PRINCIPAL, 'dash-1');
    expect(result.charts).toHaveLength(2);
    expect(result.charts[0]!.chartType).toBe('BAR');
  });
});
