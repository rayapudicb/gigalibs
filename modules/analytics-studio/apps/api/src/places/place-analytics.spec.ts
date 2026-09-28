import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';

const principal: AnalyticsPrincipal = Object.freeze({
  tenantId: 'tenant-a',
  subject: 'user-a',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['analytics:read', 'analytics:action'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});
const query = { factType: 'LABOUR_HOURS', under: 'APAC', from: '2026-09-01', to: '2026-09-30' };

// WI-OI-064b: drill-down reads one ancestor's children from rollups; rebuilds are idempotent and audited.
describe('PlaceAnalyticsService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let db: { queryWithTenant: ReturnType<typeof vi.fn>; withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: PlaceAnalyticsService;

  beforeEach(() => {
    client = { query: vi.fn() };
    db = {
      queryWithTenant: vi.fn(),
      withTenantTransaction: vi.fn(async (_tenantId: string, callback: (value: unknown) => unknown) => callback(client)),
    };
    service = new PlaceAnalyticsService(db as unknown as DatabaseService);
  });

  it('returns each child of the requested place with the facts recorded on the place itself', async () => {
    db.queryWithTenant.mockResolvedValue({
      rows: [
        { path: 'APAC', self: true, quantity: '2.0000', fact_count: '1' },
        { path: 'APAC.BLR_01', self: false, quantity: '12.0000', fact_count: '2' },
        { path: 'APAC.PNQ_01', self: false, quantity: '6.0000', fact_count: '1' },
      ],
    });
    await expect(service.drilldown(principal, query)).resolves.toMatchObject({
      factType: 'LABOUR_HOURS',
      under: 'APAC',
      total: 20,
      items: [
        { path: 'APAC', code: 'APAC', self: true, quantity: 2, factCount: 1 },
        { path: 'APAC.BLR_01', code: 'BLR_01', self: false, quantity: 12 },
        { path: 'APAC.PNQ_01', code: 'PNQ_01', quantity: 6 },
      ],
    });
    const [tenantId, sql, params] = db.queryWithTenant.mock.calls[0]!;
    expect(tenantId).toBe('tenant-a');
    // Text, not ltree: only leakproof equality becomes an index condition under forced RLS (migration 000014).
    expect(sql).toContain('ancestor_path = $3\n');
    expect(sql).toContain('day BETWEEN $4::date AND $5::date');
    expect(params).toEqual(['tenant-a', 'LABOUR_HOURS', 'APAC', '2026-09-01', '2026-09-30']);
  });

  it('treats a missing place as the whole estate', async () => {
    db.queryWithTenant.mockResolvedValue({ rows: [] });
    await service.drilldown(principal, { ...query, under: undefined });
    expect(db.queryWithTenant.mock.calls[0]![2][2]).toBe('');
  });

  it.each([
    [{ ...query, factType: 'REVENUE' }],
    [{ ...query, under: "APAC'); DROP TABLE x; --" }],
    [{ ...query, from: '2026-02-30' }],
    [{ ...query, from: '2026-09-30', to: '2026-09-01' }],
    [{ ...query, from: '2025-01-01', to: '2026-09-30' }],
  ])('rejects an invalid query before touching the database: %j', async (bad) => {
    await expect(service.drilldown(principal, bad)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryWithTenant).not.toHaveBeenCalled();
  });

  it('refuses a spatially scoped member instead of showing the whole estate', async () => {
    const scoped = { ...principal, spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [] } };
    await expect(service.drilldown(scoped, query)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rebuildRollups(scoped, { from: '2026-09-01', to: '2026-09-30' }, 'corr')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.queryWithTenant).not.toHaveBeenCalled();
    expect(db.withTenantTransaction).not.toHaveBeenCalled();
  });

  it('rebuilds a window through the database function and audits it in the same transaction', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ rows: '11' }] }).mockResolvedValue({ rows: [] });
    await expect(service.rebuildRollups(principal, { from: '2026-09-01', to: '2026-09-30' }, 'corr-1')).resolves.toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      rollupRows: 11,
    });
    expect(client.query.mock.calls[0]![0]).toContain('rebuild_place_rollups($1, $2::date, $3::date)');
    expect(client.query.mock.calls[0]![1]).toEqual(['tenant-a', '2026-09-01', '2026-09-30']);
    expect(client.query.mock.calls[1]![0]).toContain('refresh_place_rollup_statistics()');
    expect(client.query.mock.calls[2]![0]).toContain("'PLACE_ROLLUPS_REBUILT'");
    expect(client.query.mock.calls[2]![1]).toEqual(['tenant-a', 'user-a', '2026-09-01..2026-09-30', expect.stringContaining('"rollupRows":11'), 'corr-1']);
  });
});

// WI-OI-064d: metric drill-down executes typed catalogue metrics over the rollups.
describe('PlaceAnalyticsService metric drill-down', () => {
  let db: { queryWithTenant: ReturnType<typeof vi.fn>; withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: PlaceAnalyticsService;
  const window = { under: 'APAC', from: '2026-09-01', to: '2026-09-30' };
  const ratio = {
    kind: 'RATIO', key: 'cost_per_labour_hour', label: 'Cost per labour hour', unit: 'CURRENCY',
    numerator: { factType: 'LABOUR_COST', aggregate: 'SUM' }, denominator: { factType: 'LABOUR_HOURS', aggregate: 'SUM' },
  };

  beforeEach(() => {
    db = { queryWithTenant: vi.fn(), withTenantTransaction: vi.fn() };
    service = new PlaceAnalyticsService(db as unknown as DatabaseService);
  });

  it('sums an aggregate metric per child and in total', async () => {
    db.queryWithTenant.mockResolvedValue({ rows: [
      { path: 'APAC.BLR_01', self: false, a: '12.0000', b: null },
      { path: 'APAC.PNQ_01', self: false, a: '6.0000', b: null },
    ] });
    const result = await service.metricDrilldown(principal, {
      metric: { kind: 'AGGREGATE', key: 'labour_hours', label: 'Labour hours', unit: 'HOURS', factType: 'LABOUR_HOURS', aggregate: 'SUM' },
      ...window,
    });
    expect(result.items.map((item) => item.value)).toEqual([12, 6]);
    expect(result.total).toEqual({ value: 18, numerator: null, denominator: null });
    const [, sql, params] = db.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('fact_type = $2');
    expect(sql).not.toContain('UNION ALL');
    expect(sql).not.toContain('ANY(');
    expect(params).toEqual(['tenant-a', 'LABOUR_HOURS', 'LABOUR_HOURS', 'APAC', '2026-09-01', '2026-09-30']);
  });

  it('divides summed parts for a ratio, totals as a ratio of totals, and returns null for a zero denominator', async () => {
    db.queryWithTenant.mockResolvedValue({ rows: [
      { path: 'APAC.BLR_01', self: false, a: '240.0000', b: '12.0000' },
      { path: 'APAC.PNQ_01', self: false, a: '60.0000', b: '0.0000' },
    ] });
    const result = await service.metricDrilldown(principal, { metric: ratio, ...window });
    expect(result.items).toEqual([
      expect.objectContaining({ code: 'BLR_01', value: 20, numerator: 240, denominator: 12 }),
      expect.objectContaining({ code: 'PNQ_01', value: null, numerator: 60, denominator: 0 }),
    ]);
    expect(result.total).toEqual({ value: 25, numerator: 300, denominator: 12 });
    const [, sql, params] = db.queryWithTenant.mock.calls[0]!;
    // Two single-fact-type index scans: equality stays an index condition even with stale statistics.
    expect(sql).toContain('fact_type = $2');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('fact_type = $3');
    expect(params.slice(1, 4)).toEqual(['LABOUR_COST', 'LABOUR_HOURS', 'APAC']);
  });

  it('counts facts for a COUNT aggregate', async () => {
    db.queryWithTenant.mockResolvedValue({ rows: [] });
    await service.metricDrilldown(principal, {
      metric: { kind: 'AGGREGATE', key: 'shifts', label: 'Shifts', unit: 'COUNT', factType: 'LABOUR_HOURS', aggregate: 'COUNT' },
      ...window,
    });
    expect(db.queryWithTenant.mock.calls[0]![1]).toContain('fact_count AS a');
  });

  it.each([
    [{ metric: { ...ratio, numerator: { factType: 'REVENUE', aggregate: 'SUM' } }, ...window }],
    [{ metric: { ...ratio, sql: 'DROP TABLE x' }, ...window }],
    [{ metric: { ...ratio, numerator: { factType: 'LABOUR_COST', aggregate: 'MAX' } }, ...window }],
  ])('rejects an untyped or unknown metric before touching the database: %j', async (bad) => {
    await expect(service.metricDrilldown(principal, bad)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryWithTenant).not.toHaveBeenCalled();
  });
});
