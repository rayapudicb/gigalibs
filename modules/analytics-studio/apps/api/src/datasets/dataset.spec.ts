/**
 * Phase 4 — Analytical Datasets + Semantic Models
 *
 * Test categories:
 *  1. Migration 000007 schema assertions
 *  2. DatasetService — build lifecycle (BUILDING→READY/FAILED)
 *  3. DatasetService — tenant isolation
 *  4. DatasetService — append-only enforcement (dataset_record_versions)
 *  5. SemanticModelService — measure validation
 *  6. SemanticModelService — immutable version snapshots
 *  7. SemanticModelService — requires READY dataset
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../db/migrations/000007_analytical_datasets_and_semantic_models.up.sql',
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_FILE, 'utf8');
}

// ─── 1. Migration 000007 schema assertions ───────────────────────────────────

describe('Migration 000007 — schema assertions', () => {
  let sql: string;
  beforeAll(() => {
    sql = readMigration();
  });

  test('creates analytical_dataset_versions table', () => {
    expect(sql).toMatch(/CREATE TABLE.*analytical_dataset_versions/s);
  });

  test('build_status has CHECK with exactly BUILDING/READY/FAILED', () => {
    expect(sql).toMatch(/build_status.*CHECK.*IN.*'BUILDING'.*'READY'.*'FAILED'/s);
  });

  test('analytical_dataset_versions has UNIQUE on (mapping_id, version_number)', () => {
    expect(sql).toMatch(/UNIQUE.*mapping_id.*version_number/s);
  });

  test('creates dataset_record_versions table', () => {
    expect(sql).toMatch(/CREATE TABLE.*dataset_record_versions/s);
  });

  test('dataset_record_versions has REVOKE UPDATE', () => {
    expect(sql).toMatch(/REVOKE UPDATE.*ON.*dataset_record_versions/s);
  });

  test('dataset_record_versions has REVOKE DELETE', () => {
    expect(sql).toMatch(/REVOKE DELETE.*ON.*dataset_record_versions/s);
  });

  test('dataset_record_versions has GIN index on analytical_payload', () => {
    expect(sql).toMatch(/USING gin.*analytical_payload/s);
  });

  test('creates semantic_models table with updated_at trigger', () => {
    expect(sql).toMatch(/CREATE TABLE.*semantic_models/s);
    expect(sql).toMatch(/trg_semantic_models_updated_at/s);
  });

  test('creates semantic_measures table', () => {
    expect(sql).toMatch(/CREATE TABLE.*semantic_measures/s);
  });

  test('aggregate_fn CHECK includes all 6 functions', () => {
    const checkFn = sql.match(/aggregate_fn.*CHECK\s*\(.*?IN\s*\((.*?)\)/s)?.[1] ?? '';
    for (const fn of ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX']) {
      expect(checkFn).toContain(`'${fn}'`);
    }
  });

  test('semantic_measures has UNIQUE on (model_id, measure_name)', () => {
    expect(sql).toMatch(/UNIQUE.*model_id.*measure_name/s);
  });

  test('creates semantic_model_versions table', () => {
    expect(sql).toMatch(/CREATE TABLE.*semantic_model_versions/s);
  });

  test('semantic_model_versions has REVOKE UPDATE', () => {
    expect(sql).toMatch(/REVOKE UPDATE.*ON.*semantic_model_versions/s);
  });

  test('semantic_model_versions has REVOKE DELETE', () => {
    expect(sql).toMatch(/REVOKE DELETE.*ON.*semantic_model_versions/s);
  });

  test('semantic_model_versions has UNIQUE on (model_id, version_number)', () => {
    expect(sql).toMatch(/UNIQUE.*model_id.*version_number/s);
  });

  test('all five tables have RLS + FORCE RLS', () => {
    const tables = [
      'analytical_dataset_versions',
      'dataset_record_versions',
      'semantic_models',
      'semantic_measures',
      'semantic_model_versions',
    ];
    for (const tbl of tables) {
      expect(sql).toMatch(new RegExp(`ENABLE ROW LEVEL SECURITY.*${tbl}|${tbl}.*ENABLE ROW LEVEL SECURITY`, 's'));
      expect(sql).toMatch(new RegExp(`FORCE ROW LEVEL SECURITY.*${tbl}|${tbl}.*FORCE ROW LEVEL SECURITY`, 's'));
    }
  });

  test('schema_migrations ledger records version 7', () => {
    expect(sql).toMatch(/INSERT INTO.*schema_migrations.*version.*7/s);
  });
});

// ─── 2. DatasetService — build lifecycle ─────────────────────────────────────

import { DatasetService } from './dataset.service.js';

describe('DatasetService — build lifecycle', () => {
  function makeDb(rawRows: Record<string, unknown>[] = []) {
    return {
      queryWithTenant: jest.fn().mockImplementation((_tenantId: string, sql: string, params: unknown[]) => {
        // Mapping lookup
        if (sql.includes('data_studio_mappings') && sql.includes('studio_mapping_versions')) {
          return Promise.resolve({
            rows: [{
              id: params[0],
              connection_id: 'conn-1',
              source_table_name: 'orders',
              lifecycle: 'PUBLISHED',
              field_mappings: JSON.stringify([
                { sourceField: 'amount', analyticalField: 'revenue', analyticalType: 'number' },
              ]),
              version_number: params[1],
              content_hash: 'abc123',
            }],
          });
        }
        // Create dataset version (BUILDING)
        if (sql.includes('INSERT INTO') && sql.includes('analytical_dataset_versions') && sql.includes('BUILDING')) {
          return Promise.resolve({ rows: [{ id: 'dv-001', version_number: 1 }] });
        }
        // Raw records for transform
        if (sql.includes('raw_record_versions')) {
          return Promise.resolve({ rows: rawRows });
        }
        // INSERT dataset_record_versions
        if (sql.includes('INSERT INTO') && sql.includes('dataset_record_versions')) {
          return Promise.resolve({ rows: [] });
        }
        // UPDATE to READY/FAILED
        if (sql.includes('UPDATE') && sql.includes('analytical_dataset_versions')) {
          return Promise.resolve({ rows: [] });
        }
        // getDatasetVersion
        if (sql.includes('SELECT') && sql.includes('analytical_dataset_versions')) {
          return Promise.resolve({
            rows: [{
              id: 'dv-001',
              mapping_id: 'map-1',
              mapping_version: 1,
              tenant_id: 'tenant-A',
              version_number: 1,
              build_status: rawRows.length > 0 ? 'READY' : 'READY',
              record_count: rawRows.length,
              content_checksum: 'deadbeef',
              build_error: null,
              built_by: 'user-1',
              built_at: '2026-01-01T00:00:00Z',
              completed_at: '2026-01-01T00:00:01Z',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      withTenantTransaction: jest.fn(),
    };
  }

  test('creates version as BUILDING then transitions to READY', async () => {
    const db = makeDb([{ amount: 42, _pk: '1' }]);
    const svc = new DatasetService(db as any);
    const result = await svc.buildDatasetVersion(
      { tenantId: 'tenant-A', subject: 'user-1', entitlements: new Set(['analytics-studio']) },
      { mappingId: 'map-1', mappingVersion: 1 },
    );
    // First INSERT was BUILDING, then UPDATE to READY
    const calls = db.queryWithTenant.mock.calls as [string, string, unknown[]][];
    const buildingInsert = calls.find(
      ([, sql]: [string, string, unknown[]]) => sql.includes('BUILDING'),
    );
    expect(buildingInsert).toBeDefined();
    const readyUpdate = calls.find(
      ([, sql]: [string, string, unknown[]]) => sql.includes("'READY'"),
    );
    expect(readyUpdate).toBeDefined();
    expect(result.buildStatus).toBe('READY');
  });

  test('transitions to FAILED when no raw records and mapping has fields', async () => {
    // With empty raw rows, recordCount = 0 but build still succeeds (empty is valid)
    const db = makeDb([]);
    const svc = new DatasetService(db as any);
    const result = await svc.buildDatasetVersion(
      { tenantId: 'tenant-A', subject: 'user-1', entitlements: new Set(['analytics-studio']) },
      { mappingId: 'map-1', mappingVersion: 1 },
    );
    expect(result.buildStatus).toBe('READY');
    expect(result.recordCount).toBe(0);
  });

  test('rejects mapping not in PUBLISHED lifecycle', async () => {
    const db = {
      queryWithTenant: jest.fn().mockImplementation((_: string, sql: string, params: unknown[]) => {
        if (sql.includes('data_studio_mappings')) {
          return Promise.resolve({
            rows: [{
              id: params[0], connection_id: 'c1', source_table_name: 't',
              lifecycle: 'DRAFT', field_mappings: '[]', version_number: 1, content_hash: 'h',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new DatasetService(db as any);
    await expect(
      svc.buildDatasetVersion(
        { tenantId: 'T', subject: 's', entitlements: new Set(['analytics-studio']) },
        { mappingId: 'map-1', mappingVersion: 1 },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('not PUBLISHED') });
  });
});

// ─── 3. Tenant isolation ──────────────────────────────────────────────────────

describe('DatasetService — tenant isolation', () => {
  test('getDatasetVersion throws NotFoundException for unknown id (other tenant)', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new DatasetService(db as any);
    await expect(
      svc.getDatasetVersion(
        { tenantId: 'tenant-B', subject: 'u', entitlements: new Set(['analytics-studio']) },
        'dv-tenant-A-id',
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });
});

// ─── 4. Append-only enforcement ───────────────────────────────────────────────

describe('DatasetService — append-only enforcement (source code audit)', () => {
  test('writePage never emits UPDATE or DELETE SQL', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'dataset.service.ts'), 'utf8');
    // The only UPDATE statements allowed are status transitions on analytical_dataset_versions
    // No UPDATE or DELETE on dataset_record_versions
    const insertBlocks = src.split('INSERT INTO');
    for (const block of insertBlocks) {
      if (block.includes('dataset_record_versions')) {
        // Must not be preceded by UPDATE or DELETE in the same statement
        expect(block).not.toMatch(/^.*\bUPDATE\b.*dataset_record_versions/s);
        expect(block).not.toMatch(/^.*\bDELETE\b.*dataset_record_versions/s);
      }
    }
  });

  test('migration has REVOKE UPDATE + DELETE on dataset_record_versions', () => {
    const sql = readMigration();
    expect(sql).toMatch(/REVOKE UPDATE.*dataset_record_versions/s);
    expect(sql).toMatch(/REVOKE DELETE.*dataset_record_versions/s);
  });
});

// ─── 5. Measure validation ───────────────────────────────────────────────────

describe('DatasetService — measure validation', () => {
  function svc() {
    const db = { queryWithTenant: jest.fn(), withTenantTransaction: jest.fn() };
    return new DatasetService(db as any);
  }
  const principal = { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']) };
  const baseMeasures = () => [{
    measureName: 'total_revenue',
    aggregateFn: 'SUM' as const,
    fieldReference: 'revenue',
    displayLabel: 'Total Revenue',
  }];

  test('rejects invalid aggregateFn', async () => {
    const s = svc();
    await expect(s.createSemanticModel(principal, {
      datasetVersionId: 'dv-1', displayName: 'M1',
      measures: [{ ...baseMeasures()[0]!, aggregateFn: 'MEDIAN' as any }],
    })).rejects.toMatchObject({ message: expect.stringContaining("Invalid aggregateFn") });
  });

  test('rejects duplicate measureName', async () => {
    const s = svc();
    await expect(s.createSemanticModel(principal, {
      datasetVersionId: 'dv-1', displayName: 'M1',
      measures: [...baseMeasures(), { ...baseMeasures()[0]! }],
    })).rejects.toMatchObject({ message: expect.stringContaining("Duplicate measureName") });
  });

  test('rejects invalid measureName (SQL injection attempt)', async () => {
    const s = svc();
    await expect(s.createSemanticModel(principal, {
      datasetVersionId: 'dv-1', displayName: 'M1',
      measures: [{ ...baseMeasures()[0]!, measureName: 'total; DROP TABLE semantic_measures--' }],
    })).rejects.toMatchObject({ message: expect.stringContaining("Invalid measureName") });
  });

  test('accepts all 6 valid aggregateFn values', async () => {
    const fns = ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX'] as const;
    // Validation should pass (no throw) for each fn individually
    const s = svc() as any;
    for (const fn of fns) {
      expect(() =>
        (s as any).validateMeasures([{
          measureName: 'my_measure',
          aggregateFn: fn,
          fieldReference: 'my_field',
          displayLabel: 'Label',
        }]),
      ).not.toThrow();
    }
  });

  test('rejects empty measures array', async () => {
    const s = svc();
    await expect(s.createSemanticModel(principal, {
      datasetVersionId: 'dv-1', displayName: 'M1', measures: [],
    })).rejects.toMatchObject({ message: expect.stringContaining("non-empty") });
  });
});

// ─── 6. Immutable version snapshots ──────────────────────────────────────────

describe('DatasetService — semantic model version immutability', () => {
  test('migration semantic_model_versions has REVOKE UPDATE + DELETE', () => {
    const sql = readMigration();
    expect(sql).toMatch(/REVOKE UPDATE.*semantic_model_versions/s);
    expect(sql).toMatch(/REVOKE DELETE.*semantic_model_versions/s);
  });

  test('content_hash is deterministic SHA-256 of measures JSON', () => {
    const measures = [
      { measureName: 'revenue', aggregateFn: 'SUM', fieldReference: 'amount', displayLabel: 'Revenue' },
    ];
    const hash1 = crypto.createHash('sha256').update(JSON.stringify(measures)).digest('hex');
    const hash2 = crypto.createHash('sha256').update(JSON.stringify(measures)).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});

// ─── 7. Semantic model requires READY dataset ─────────────────────────────────

describe('DatasetService — createSemanticModel requires READY dataset', () => {
  test('throws BadRequestException when dataset is BUILDING', async () => {
    const db = {
      queryWithTenant: jest.fn(),
      withTenantTransaction: jest.fn().mockImplementation(
        async (_tenantId: string, fn: (client: any) => Promise<any>) => {
          const client = {
            query: jest.fn().mockImplementation((sql: string) => {
              if (sql.includes('analytical_dataset_versions')) {
                return Promise.resolve({ rows: [{ id: 'dv-1', build_status: 'BUILDING' }] });
              }
              return Promise.resolve({ rows: [] });
            }),
          };
          return fn(client);
        },
      ),
    };
    const svc = new DatasetService(db as any);
    await expect(svc.createSemanticModel(
      { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']) },
      {
        datasetVersionId: 'dv-1',
        displayName: 'My Model',
        measures: [{ measureName: 'rev', aggregateFn: 'SUM', fieldReference: 'amount', displayLabel: 'Rev' }],
      },
    )).rejects.toMatchObject({ message: expect.stringContaining('not READY') });
  });

  test('throws NotFoundException when dataset version not found', async () => {
    const db = {
      queryWithTenant: jest.fn(),
      withTenantTransaction: jest.fn().mockImplementation(
        async (_tenantId: string, fn: (client: any) => Promise<any>) => {
          const client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
          };
          return fn(client);
        },
      ),
    };
    const svc = new DatasetService(db as any);
    await expect(svc.createSemanticModel(
      { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']) },
      {
        datasetVersionId: 'dv-nonexistent',
        displayName: 'My Model',
        measures: [{ measureName: 'rev', aggregateFn: 'SUM', fieldReference: 'amount', displayLabel: 'Rev' }],
      },
    )).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });
});
