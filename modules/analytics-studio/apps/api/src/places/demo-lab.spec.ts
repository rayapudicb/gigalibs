import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { DemoLabService } from './demo-lab.service.js';

const principal: AnalyticsPrincipal = Object.freeze({
  tenantId: 'demo-qsr',
  subject: 'platform-admin',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['analytics:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});
const request = {
  placeTypes: [{ code: 'REGION', label: 'Region' }, { code: 'STORE', label: 'Store' }, { code: 'AREA', label: 'Area' }],
  demoProfile: {
    currency: 'USD', regions: 4, sitesPerRegion: 25, zonesPerSite: 2, labourHoursPerSitePerDay: 120,
    labourCostPerHour: 16, spendPerSitePerDay: 2600, downtimeMinutesPerSitePerDay: 18, carbonKgPerLabourHour: 1.1,
  },
  days: 90,
  endDate: '2026-09-30',
  seed: 42,
};

// WI-OI-064e: Demo Lab replaces synthetic data in one transaction, rebuilds rollups and audits the change.
describe('DemoLabService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let db: { queryWithTenant: ReturnType<typeof vi.fn>; withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: DemoLabService;

  beforeEach(() => {
    client = { query: vi.fn() };
    db = {
      queryWithTenant: vi.fn(),
      withTenantTransaction: vi.fn(async (_tenantId: string, callback: (value: unknown) => unknown) => callback(client)),
    };
    service = new DemoLabService(db as unknown as DatabaseService);
  });

  it('resets, generates with bound parameters, rebuilds, refreshes statistics and audits in one transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 72_000, rows: [] })
      .mockResolvedValueOnce({ rows: [{ rows: '30000' }] })
      .mockResolvedValue({ rows: [] });
    await expect(service.generate(principal, request, 'corr-1')).resolves.toEqual({
      facts: 72_000,
      rollupRows: 30_000,
      from: '2026-07-03',
      to: '2026-09-30',
    });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('reset_synthetic_facts($1)');
    expect(statements[1]).toContain('INSERT INTO gigalibs_analytics.operational_facts');
    expect(statements[1]).toContain("'SYNTHETIC', 'demo-lab'");
    expect(statements[1]).not.toMatch(/REGION|STORE|AREA/);
    expect(client.query.mock.calls[1]![1]).toEqual([
      'demo-qsr', '2026-09-30', 90, 42, 4, 25, 2, 120, 16, 'REGION', 'STORE', 'AREA', 1.1, 2600, 'USD', 18,
    ]);
    expect(statements[2]).toContain('rebuild_place_rollups');
    expect(statements[3]).toContain('refresh_place_rollup_statistics');
    expect(statements[4]).toContain('DEMO_DATASET');
    expect(client.query.mock.calls[4]![1]![1]).toBe('DEMO_DATA_GENERATED');
  });

  it('generates site-level facts when the profile has no zones', async () => {
    client.query.mockResolvedValue({ rows: [{ rows: '0' }], rowCount: 0 });
    await service.generate(principal, { ...request, placeTypes: request.placeTypes.slice(0, 2), demoProfile: { ...request.demoProfile, zonesPerSite: 0 } }, 'corr-2');
    expect(String(client.query.mock.calls[1]![0])).not.toContain('generate_series(1, $7::int) AS z');
  });

  it.each([
    [{ ...request, days: 400 }],
    [{ ...request, placeTypes: request.placeTypes.slice(0, 2) }],
    [{ ...request, demoProfile: { ...request.demoProfile, regions: 50, sitesPerRegion: 200 } }],
    [{ ...request, placeTypes: [{ code: "R'; DROP TABLE x; --", label: 'R' }, ...request.placeTypes.slice(1)] }],
  ])('rejects an invalid or oversized request before touching the database: %#', async (bad) => {
    await expect(service.generate(principal, bad, 'corr')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.withTenantTransaction).not.toHaveBeenCalled();
  });

  it('resets through the tenant-bound function and rebuilds rollups only for remaining live facts', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ deleted_facts: '72000', deleted_rollups: '30000' }] })
      .mockResolvedValueOnce({ rows: [{ first: null, last: null }] })
      .mockResolvedValue({ rows: [] });
    await expect(service.reset(principal, 'corr-3')).resolves.toEqual({ facts: 0, rollupRows: 0, from: null, to: null });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('reset_synthetic_facts($1)');
    expect(statements.some((sql) => sql.includes('rebuild_place_rollups'))).toBe(false);
    expect(client.query.mock.calls.at(-1)![1]![1]).toBe('DEMO_DATA_RESET');
  });

  it('refuses a spatially scoped member', async () => {
    const scoped = { ...principal, spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [] } };
    await expect(service.generate(scoped, request, 'corr')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reset(scoped, 'corr')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
