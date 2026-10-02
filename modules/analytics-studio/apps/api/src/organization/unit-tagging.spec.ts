import { describe, expect, it, vi } from 'vitest';
import { DatasetService } from '../datasets/dataset.service.js';

// WI-OI-109e3: a mapping field marked as the record's unit stamps `unit_id` at build. Empty means tenant-shared; a value
// that matches no unit is stamped UNMATCHED, so only tenant-wide members see it (a typo never widens access).
describe('dataset build — organization units', () => {
  function makeDb(match: 'CODE' | 'ID') {
    const inserted: unknown[][] = [];
    const db = {
      queryWithTenant: vi.fn(async (_tenantId: string, sql: string, params: unknown[]) => {
        if (sql.includes('data_studio_mappings') && sql.includes('studio_mapping_versions'))
          return {
            rows: [{
              id: params[0], connection_id: 'conn-1', source_table_name: 'shifts', lifecycle: 'PUBLISHED', version_number: params[1], content_hash: 'abc',
              field_mappings: JSON.stringify([
                { sourceField: 'store', analyticalField: 'store', analyticalType: 'string', organizationUnit: { match } },
                { sourceField: 'hours', analyticalField: 'hours', analyticalType: 'number' },
              ]),
            }],
          };
        if (sql.includes('org_replica_units')) return { rows: [{ code: 'S-101', unit_id: 'unit-101', name: 'Store 101' }] };
        if (sql.includes('INSERT INTO') && sql.includes('analytical_dataset_versions') && sql.includes('BUILDING')) return { rows: [{ id: 'dv-001', version_number: 1 }] };
        if (sql.includes('raw_record_versions'))
          return {
            rows: [
              { raw_payload: { store: match === 'CODE' ? 'S-101' : 'unit-101', hours: 8 }, source_pk_hash: 'a' },
              { raw_payload: { store: '', hours: 4 }, source_pk_hash: 'b' },
              { raw_payload: { store: 'S-999', hours: 2 }, source_pk_hash: 'c' },
            ],
          };
        if (sql.includes('INSERT INTO') && sql.includes('dataset_record_versions')) {
          inserted.push(params);
          return { rows: [] };
        }
        if (sql.includes('SELECT') && sql.includes('analytical_dataset_versions'))
          return { rows: [{ id: 'dv-001', mapping_id: 'map-1', mapping_version: 1, tenant_id: 'tenant-A', version_number: 1, build_status: 'READY', record_count: 3, content_checksum: 'x', build_error: null, built_by: 'u', built_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-01T00:00:01Z' }] };
        return { rows: [] };
      }),
      withTenantTransaction: vi.fn(async (_tenantId: string, work: (client: unknown) => unknown) => work({ query: vi.fn(async () => ({ rows: [] })) })),
    };
    return { db, inserted };
  }

  const payloads = (inserted: unknown[][]) =>
    inserted.flat().filter((value): value is string => typeof value === 'string' && value.startsWith('{')).map((value) => JSON.parse(value) as Record<string, unknown>);

  it.each(['CODE', 'ID'] as const)('stamps the unit matched by %s, shared when empty, UNMATCHED when unknown', async (match) => {
    const { db, inserted } = makeDb(match);
    await new DatasetService(db as never).buildDatasetVersion({ tenantId: 'tenant-A', subject: 'user-1', entitlements: new Set(['analytics-studio']) } as never, { mappingId: 'map-1', mappingVersion: 1 });
    const rows = payloads(inserted).sort((a, b) => Number(b.hours) - Number(a.hours));
    expect(rows.map((row) => [row.store, row.unit_id, row.hours])).toEqual([
      ['Store 101', 'unit-101', 8],
      ['Shared', null, 4],
      ['Unknown unit', 'UNMATCHED', 2],
    ]);
  });
});

describe('mapping — organization unit field', () => {
  const validate = async (mappings: unknown[]) => {
    const { SchemaDiscoveryService } = await import('../schema-discovery/schema-discovery.service.js');
    return () => (new SchemaDiscoveryService({} as never) as unknown as { validateFieldMappings(value: unknown[]): void }).validateFieldMappings(mappings);
  };
  const unit = { sourceField: 'store', analyticalField: 'store', analyticalType: 'string', organizationUnit: { match: 'CODE' } };

  it('accepts one string unit field, which may share its source with a plain field', async () => {
    expect(await validate([unit, { sourceField: 'store', analyticalField: 'store_code', analyticalType: 'string' }])).not.toThrow();
  });

  it.each([
    [[{ ...unit, organizationUnit: { match: 'NAME' } }], /CODE or ID/],
    [[{ ...unit, analyticalType: 'number' }], /must be a string/],
    [[{ ...unit, place: { byCode: true } }], /cannot also/],
    [[unit, { ...unit, analyticalField: 'store2' }], /one organization unit field/],
    [[{ sourceField: 'x', analyticalField: 'unit_id', analyticalType: 'string' }], /reserved for organization units/],
  ])('refuses %j', async (mappings, message) => {
    expect(await validate(mappings)).toThrow(message);
  });
});
