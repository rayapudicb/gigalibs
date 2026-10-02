import { AnalyticsQueryV1Schema, type AnalyticsFieldType } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { buildAnalyticsQuery } from '../query-engine/query-builder.js';
import { organizationFilters, organizationScopeCondition, resolveOrganizationAccess } from './organization-scope.js';

const fields = new Map<string, AnalyticsFieldType>([
  ['store', 'string'],
  ['unit_id', 'string'],
  ['hours', 'number'],
]);
const query = AnalyticsQueryV1Schema.parse({
  semanticModelId: '00000000-0000-4000-8000-000000000001',
  measures: ['labour_hours'],
  dimensions: ['store'],
  limit: 50,
});
const measures = new Map([['labour_hours', { name: 'labour_hours', aggregateFn: 'SUM' as const, fieldReference: 'hours', label: 'Labour hours' }]]);
const regional = { readUnits: ['north', 'store-101'], writeUnits: ['store-101'], versionId: 'version-7', denied: false };

// WI-OI-109e3 (ADR-0018 §3): Analytics answers, dashboard filters and reports keep a member to their units' records
// and tenant-shared ones; a dataset whose records carry no unit is entirely shared.
describe('Analytics organization scope', () => {
  it('filters rows to the member units and shared records, binding the units as one array', () => {
    const built = buildAnalyticsQuery({ datasetVersionId: 'dsv-1', query, fields, measures, organizationScope: regional });
    expect(built.text).toMatch(/\(\(r\.analytical_payload->>'unit_id'\) IS NULL OR \(r\.analytical_payload->>'unit_id'\) = ANY\(\$\d+::text\[\]\)\)/);
    expect(built.params).toContainEqual(['north', 'store-101']);
  });

  it('never answers a unit-scoped question from a summary, which holds no unit', () => {
    expect(() =>
      buildAnalyticsQuery({
        datasetVersionId: 'dsv-1',
        query,
        fields,
        measures,
        organizationScope: regional,
        summary: { id: 'summary-1', dimensions: ['store'], timeField: null, numericFields: ['hours'] },
      }),
    ).toThrow(/answered from the rows/);
  });

  it('filters only datasets that carry units, except a denied scope, which sees nothing anywhere', () => {
    expect(organizationFilters(null, fields)).toBe(false);
    expect(organizationFilters(regional, fields)).toBe(true);
    expect(organizationFilters(regional, new Map([['store', 'string']]))).toBe(false);
    const denied = { readUnits: [], writeUnits: [], versionId: null, denied: true };
    expect(organizationFilters(denied, new Map([['store', 'string']]))).toBe(true);
    expect(organizationScopeCondition('r', denied, () => '$9')).toBe('FALSE');
  });

  it('applies no filter without a tree and verifies the named version for tenant-wide members', async () => {
    const calls: string[] = [];
    const db = { queryWithTenant: async (_tenant: string, sql: string) => { calls.push(sql); return { rows: [{ ready: true }] }; } } as never;
    const principal = { tenantId: 'tenant-1' } as never;
    await expect(resolveOrganizationAccess(db, principal)).resolves.toBeNull();
    const tenantAccess = await resolveOrganizationAccess(db, { ...(principal as object), organization: { mode: 'TENANT', tree_version: 'v7' } } as never);
    expect(tenantAccess).toMatchObject({ readUnits: null, writeUnits: null, versionId: 'v7' });
    expect(organizationFilters(tenantAccess, fields)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('also refuses a tenant-wide answer while its named version is missing', async () => {
    const db = { queryWithTenant: async () => ({ rows: [] }) } as never;
    const principal = { tenantId: 'tenant-1', organization: { mode: 'TENANT', tree_version: 'v9' } } as never;
    await expect(resolveOrganizationAccess(db, principal)).rejects.toMatchObject({ status: 503 });
  });

  it('refuses with 503, not a wider answer, when the copy does not hold the named version yet', async () => {
    const db = { queryWithTenant: async () => ({ rows: [] }) } as never;
    const principal = { tenantId: 'tenant-1', organization: { mode: 'UNITS', tree_version: 'v8', read_roots: ['north'], write_roots: [] } } as never;
    await expect(resolveOrganizationAccess(db, principal)).rejects.toMatchObject({ status: 503 });
  });
});
