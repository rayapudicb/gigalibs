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

const PRINCIPAL = { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']), spatialScope: { mode: 'UNBOUNDED' } };

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
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', 3600);
    expect(result.freshness).toBe('FRESH');
  });

  test('STALE when dataset exceeds TTL', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 10, completedOffsetSeconds: 7200, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', 3600);
    expect(result.freshness).toBe('STALE');
  });

  test('REBUILDING when a BUILDING version exists in parallel', async () => {
    const db = mockDbForFreshness({ buildingCount: 1, buildStatus: 'READY', recordCount: 10, completedOffsetSeconds: 60, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', 3600);
    expect(result.freshness).toBe('REBUILDING');
  });

  test('PARTIAL when READY dataset has 0 records', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 0, completedOffsetSeconds: 60, freshnessttl: 3600 });
    const svc = new QueryEngineService(db as any);
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', 3600);
    expect(result.freshness).toBe('PARTIAL');
  });

  test('UNAVAILABLE when no READY dataset version found', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'FAILED', recordCount: 0, completedOffsetSeconds: 0, freshnessttl: null });
    const svc = new QueryEngineService(db as any);
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', null);
    expect(result.freshness).toBe('UNAVAILABLE');
  });

  test('FRESH when no TTL configured (no expiry check)', async () => {
    const db = mockDbForFreshness({ buildingCount: 0, buildStatus: 'READY', recordCount: 5, completedOffsetSeconds: 999999, freshnessttl: null });
    const svc = new QueryEngineService(db as any);
    const result = await (svc as any).computeFreshness(PRINCIPAL.tenantId, 'dv-1', null);
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
  test('runSpec throws NotFoundException for semantic model not belonging to tenant', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new QueryEngineService(db as any);
    await expect(svc.runSpec(
      { tenantId: 'tenant-B', subject: 'u', entitlements: new Set(['analytics-studio']), spatialScope: { mode: 'UNBOUNDED' } },
      { semanticModelId: '00000000-0000-4000-8000-000000000001', measures: ['m1'] },
    )).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });
});

// ─── 5. Obsolete runtime retirement ──────────────────────────────────────────

describe('QueryEngineService & Charts — obsolete runtime retirement', () => {
  test('QueryEngineService no longer exposes runQuery method', () => {
    const svc = new QueryEngineService({} as any);
    expect((svc as any).runQuery).toBeUndefined();
  });

  test('QueryEngineController no longer exposes runQuery route handler', async () => {
    const { QueryEngineController } = await import('./query-engine.controller.js');
    const controller = new QueryEngineController({} as any);
    expect((controller as any).runQuery).toBeUndefined();
    expect(controller.runSpec).toBeDefined();
  });

  test('ChartsController is completely removed from query-engine.controller', async () => {
    const mod = await import('./query-engine.controller.js');
    expect((mod as any).ChartsController).toBeUndefined();
  });

  test('chart.service.ts file has been deleted from repository', () => {
    const chartServicePath = path.resolve(__dirname, 'chart.service.ts');
    expect(fs.existsSync(chartServicePath)).toBe(false);
  });
});
