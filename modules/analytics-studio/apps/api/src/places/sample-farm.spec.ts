import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import type { DatasetService } from '../datasets/dataset.service.js';
import type { FormulaMeasureService } from '../query-engine/formula-measure.service.js';
import type { SchemaDiscoveryService } from '../schema-discovery/schema-discovery.service.js';
import {
  SAMPLE_FARM_FIELDS,
  SAMPLE_FARM_SOURCE_NAME,
  SAMPLE_FARM_TABLE,
  SampleFarmService,
  generateSampleFarmHarvests,
} from './sample-farm.service.js';

const principal: AnalyticsPrincipal = Object.freeze({
  tenantId: 'demo-agri',
  subject: 'maker-1',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['analytics:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});
const CONNECTION = '00000000-0000-4000-8000-00000000c001';
const MAPPING = '00000000-0000-4000-8000-00000000a001';
const DATASET = '00000000-0000-4000-8000-00000000d001';
const MODEL = '00000000-0000-4000-8000-00000000e001';
const FORMULA = '00000000-0000-4000-8000-00000000f001';
const VERSION = '00000000-0000-4000-8000-00000000f101';

// WI-OI-103d d7: a labelled synthetic farm source that goes through the real discovery, mapping, dataset and model steps.
describe('generateSampleFarmHarvests', () => {
  it('is deterministic, labelled SYNTHETIC, uniquely keyed and shaped like the published mapping', () => {
    const rows = generateSampleFarmHarvests();
    expect(rows).toHaveLength(960);
    expect(generateSampleFarmHarvests()).toEqual(rows);
    expect(new Set(rows.map((row) => row.record_id)).size).toBe(960);
    expect(rows.every((row) => row.data_origin === 'SYNTHETIC')).toBe(true);
    const mapped = SAMPLE_FARM_FIELDS.map((field) => field.sourceField).sort();
    expect(Object.keys(rows[0]!).filter((key) => key !== 'data_origin').sort()).toEqual(mapped);
    for (const row of rows) {
      expect(row.harvest_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.area_ha).toBeGreaterThan(0);
      expect(row.yield_kg).toBeGreaterThan(0);
    }
    expect(new Set(rows.map((row) => row.farm))).toEqual(new Set(['Sample Farm North', 'Sample Farm River', 'Sample Farm Hill']));
  });
});

describe('SampleFarmService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let db: { queryWithTenant: ReturnType<typeof vi.fn>; withTenantTransaction: ReturnType<typeof vi.fn> };
  let discovery: Record<'discoverSchema' | 'createMapping' | 'publishMappingVersion', ReturnType<typeof vi.fn>>;
  let datasets: Record<'buildDatasetVersion' | 'createSemanticModel', ReturnType<typeof vi.fn>>;
  let formulas: Record<'create' | 'get' | 'submit', ReturnType<typeof vi.fn>>;
  let service: SampleFarmService;
  let stored: { connection: boolean; schema: boolean; mapping: boolean; dataset: boolean; model: boolean; formula: boolean };

  const formulaWith = (state: string) => ({
    id: FORMULA,
    semanticModelId: MODEL,
    versions: [{ id: VERSION, versionNumber: 1, state, createdBy: 'maker-1' }],
  });

  beforeEach(() => {
    stored = { connection: false, schema: false, mapping: false, dataset: false, model: false, formula: false };
    client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_analytics.source_connections')) {
          stored.connection = true;
          return { rows: [{ id: CONNECTION }] };
        }
        if (sql.includes('INSERT INTO gigalibs_analytics.source_sync_runs')) return { rows: [{ id: 'run-1' }] };
        return { rows: [], rowCount: 0 };
      }),
    };
    db = {
      queryWithTenant: vi.fn(async (_tenant: string, sql: string) => {
        if (sql.includes('FROM gigalibs_analytics.source_connections')) return { rows: stored.connection ? [{ id: CONNECTION }] : [] };
        if (sql.includes('count(*)::text AS count')) return { rows: [{ count: stored.connection ? '960' : '0' }] };
        if (sql.includes('discovered_source_schemas')) return { rows: stored.schema ? [{ '?column?': 1 }] : [] };
        if (sql.includes('FROM gigalibs_analytics.data_studio_mappings m')) return { rows: stored.mapping ? [{ id: MAPPING, version: 1 }] : [] };
        if (sql.includes('FROM gigalibs_analytics.analytical_dataset_versions')) return { rows: stored.dataset ? [{ id: DATASET }] : [] };
        if (sql.includes('FROM gigalibs_analytics.semantic_models')) return { rows: stored.model ? [{ id: MODEL }] : [] };
        if (sql.includes('FROM gigalibs_analytics.formula_measures')) return { rows: stored.formula ? [{ id: FORMULA }] : [] };
        return { rows: [] };
      }),
      withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) => callback(client)),
    };
    discovery = {
      discoverSchema: vi.fn(async () => ((stored.schema = true), {})),
      createMapping: vi.fn(async () => ((stored.mapping = true), { id: MAPPING })),
      publishMappingVersion: vi.fn(async () => ({ id: MAPPING, latestVersionNumber: 1 })),
    };
    datasets = {
      buildDatasetVersion: vi.fn(async () => ((stored.dataset = true), { id: DATASET, buildStatus: 'READY', buildError: null })),
      createSemanticModel: vi.fn(async () => ((stored.model = true), { id: MODEL })),
    };
    formulas = {
      create: vi.fn(async () => ((stored.formula = true), formulaWith('DRAFT'))),
      get: vi.fn(async () => formulaWith('PENDING_REVIEW')),
      submit: vi.fn(async () => formulaWith('PENDING_REVIEW')),
    };
    service = new SampleFarmService(
      db as unknown as DatabaseService,
      discovery as unknown as SchemaDiscoveryService,
      datasets as unknown as DatasetService,
      formulas as unknown as FormulaMeasureService,
    );
  });

  it('writes one labelled SYNTHETIC source, then runs discovery, mapping, dataset, model and a submitted formula', async () => {
    const status = await service.load(principal, 'corr-1');

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain("'SYNTHETIC', 'sample.invalid'");
    expect(client.query.mock.calls[0]![1]).toEqual(['demo-agri', SAMPLE_FARM_SOURCE_NAME, SAMPLE_FARM_TABLE, 'maker-1']);
    expect(statements[1]).toContain("'SUCCEEDED'");
    expect(statements.filter((sql) => sql.includes('INSERT INTO gigalibs_analytics.raw_record_versions'))).toHaveLength(5);
    expect(statements.at(-1)).toContain("'DEMO_SOURCE_LOADED'");

    expect(discovery.discoverSchema).toHaveBeenCalledWith(principal, CONNECTION, SAMPLE_FARM_TABLE, 5000);
    expect(discovery.createMapping).toHaveBeenCalledWith(principal, expect.objectContaining({ connectionId: CONNECTION, fieldMappings: SAMPLE_FARM_FIELDS }));
    expect(discovery.publishMappingVersion).toHaveBeenCalledWith(principal, MAPPING, { fieldMappings: SAMPLE_FARM_FIELDS });
    expect(datasets.buildDatasetVersion).toHaveBeenCalledWith(principal, { mappingId: MAPPING, mappingVersion: 1 });
    expect(datasets.createSemanticModel).toHaveBeenCalledWith(principal, expect.objectContaining({ datasetVersionId: DATASET, displayName: SAMPLE_FARM_SOURCE_NAME }));
    expect(formulas.create).toHaveBeenCalledWith(principal, expect.objectContaining({ semanticModelId: MODEL, name: 'yield_per_hectare' }));
    expect(formulas.submit).toHaveBeenCalledWith(principal, FORMULA, VERSION, expect.objectContaining({ reason: expect.any(String) }));
    expect(status).toEqual({
      loaded: true,
      connectionId: CONNECTION,
      rawRecords: 960,
      datasetVersionId: DATASET,
      semanticModelId: MODEL,
      formula: { id: FORMULA, versionId: VERSION, state: 'PENDING_REVIEW' },
    });
  });

  it('reuses every step an earlier load produced and writes nothing new', async () => {
    stored = { connection: true, schema: true, mapping: true, dataset: true, model: true, formula: true };
    await service.load(principal, 'corr-2');
    expect(client.query).not.toHaveBeenCalled();
    for (const spy of [...Object.values(discovery), ...Object.values(datasets), formulas.create, formulas.submit]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('stops when the dataset build fails instead of modelling an empty dataset', async () => {
    datasets.buildDatasetVersion.mockResolvedValueOnce({ id: DATASET, buildStatus: 'FAILED', buildError: 'cast failed' });
    await expect(service.load(principal, 'corr-3')).rejects.toThrow(/FAILED: cast failed/);
    expect(datasets.createSemanticModel).not.toHaveBeenCalled();
  });

  it('refuses a spatially scoped member', async () => {
    const scoped = { ...principal, spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [] } };
    await expect(service.load(scoped, 'corr')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.withTenantTransaction).not.toHaveBeenCalled();
  });
});
