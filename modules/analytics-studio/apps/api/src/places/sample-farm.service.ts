import { createHash } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { FormulaMeasureDefinitionV1, FormulaMeasureV1, SampleFarmStatusV1 } from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { DatasetService, type SemanticMeasureDto } from '../datasets/dataset.service.js';
import { FormulaMeasureService } from '../query-engine/formula-measure.service.js';
import { SchemaDiscoveryService, type FieldMappingEntry } from '../schema-discovery/schema-discovery.service.js';
import { assertUnscoped } from './demo-lab.service.js';

export const SAMPLE_FARM_SOURCE_NAME = 'Sample farm harvests (synthetic)';
export const SAMPLE_FARM_TABLE = 'sample_farm_harvests';
const SAMPLE_FARM_DESCRIPTION = 'Synthetic harvest logs generated for demonstrations. These are not real farm records.';
const FORMULA_NAME = 'yield_per_hectare';

/** Fields of a harvest log, mapped one to one; `latitude` and `longitude` let Explore draw a map. */
export const SAMPLE_FARM_FIELDS: FieldMappingEntry[] = [
  { sourceField: 'record_id', analyticalField: 'record_id', analyticalType: 'string' },
  { sourceField: 'farm', analyticalField: 'farm', analyticalType: 'string' },
  { sourceField: 'field', analyticalField: 'field', analyticalType: 'string' },
  { sourceField: 'crop', analyticalField: 'crop', analyticalType: 'string' },
  { sourceField: 'season', analyticalField: 'season', analyticalType: 'string' },
  { sourceField: 'harvest_date', analyticalField: 'harvest_date', analyticalType: 'date' },
  { sourceField: 'area_ha', analyticalField: 'area_ha', analyticalType: 'number' },
  { sourceField: 'yield_kg', analyticalField: 'yield_kg', analyticalType: 'number' },
  { sourceField: 'input_cost_inr', analyticalField: 'input_cost_inr', analyticalType: 'number' },
  { sourceField: 'latitude', analyticalField: 'latitude', analyticalType: 'number' },
  { sourceField: 'longitude', analyticalField: 'longitude', analyticalType: 'number' },
];

const SAMPLE_FARM_MEASURES: SemanticMeasureDto[] = [
  { measureName: 'total_yield_kg', aggregateFn: 'SUM', fieldReference: 'yield_kg', displayLabel: 'Yield (kg)' },
  { measureName: 'harvested_area_ha', aggregateFn: 'SUM', fieldReference: 'area_ha', displayLabel: 'Area harvested (ha)' },
  { measureName: 'input_cost_inr', aggregateFn: 'SUM', fieldReference: 'input_cost_inr', displayLabel: 'Input cost (INR)' },
  { measureName: 'harvest_logs', aggregateFn: 'COUNT', fieldReference: 'record_id', displayLabel: 'Harvest logs' },
];

const YIELD_PER_HECTARE: FormulaMeasureDefinitionV1 = {
  displayLabel: 'Yield per hectare',
  description: 'Total yield divided by the area harvested.',
  unit: 'kg/ha',
  expression: {
    kind: 'binary',
    operator: 'divide',
    left: { kind: 'measure', name: 'total_yield_kg' },
    right: { kind: 'measure', name: 'harvested_area_ha' },
  },
};

/**
 * WI-OI-103d d7: a labelled synthetic farm source for Demo Lab workspaces (the web BFF only routes here for tenants with
 * `demo-lab`). About 1,000 synthetic harvest logs are written once as the raw records of a SYNTHETIC connection, then go
 * through the real steps: schema discovery, a published mapping, a dataset build and a semantic model. "Yield per
 * hectare" is created and submitted by the loading member; a different member must approve it (maker-checker).
 *
 * Loading is idempotent and resumable: each step reuses what an earlier load already produced.
 */
@Injectable()
export class SampleFarmService {
  constructor(
    private readonly db: DatabaseService,
    private readonly discovery: SchemaDiscoveryService,
    private readonly datasets: DatasetService,
    private readonly formulas: FormulaMeasureService,
  ) {}

  async status(principal: AnalyticsPrincipal): Promise<SampleFarmStatusV1> {
    const tenantId = principal.tenantId;
    const connectionId = await this.one<{ id: string }>(
      tenantId,
      `SELECT id FROM gigalibs_analytics.source_connections
        WHERE source_type = 'SYNTHETIC' AND display_name = $1 ORDER BY created_at LIMIT 1`,
      [SAMPLE_FARM_SOURCE_NAME],
    ).then((row) => row?.id ?? null);
    if (!connectionId) {
      return { loaded: false, connectionId: null, rawRecords: 0, datasetVersionId: null, semanticModelId: null, formula: null };
    }
    const rawRecords = await this.one<{ count: string }>(
      tenantId,
      `SELECT count(*)::text AS count FROM gigalibs_analytics.raw_record_versions WHERE connection_id = $1`,
      [connectionId],
    ).then((row) => Number(row?.count ?? 0));
    const datasetVersionId = await this.one<{ id: string }>(
      tenantId,
      `SELECT d.id FROM gigalibs_analytics.analytical_dataset_versions d
         JOIN gigalibs_analytics.data_studio_mappings m ON m.id = d.mapping_id
        WHERE m.connection_id = $1 AND d.build_status = 'READY'
        ORDER BY d.version_number DESC LIMIT 1`,
      [connectionId],
    ).then((row) => row?.id ?? null);
    const semanticModelId = datasetVersionId
      ? await this.one<{ id: string }>(
          tenantId,
          `SELECT id FROM gigalibs_analytics.semantic_models WHERE dataset_version_id = $1 ORDER BY created_at LIMIT 1`,
          [datasetVersionId],
        ).then((row) => row?.id ?? null)
      : null;
    const formulaId = semanticModelId
      ? await this.one<{ id: string }>(
          tenantId,
          `SELECT id FROM gigalibs_analytics.formula_measures WHERE semantic_model_id = $1 AND measure_name = $2`,
          [semanticModelId, FORMULA_NAME],
        ).then((row) => row?.id ?? null)
      : null;
    const formula = formulaId ? latestVersion(await this.formulas.get(principal, formulaId)) : null;
    return { loaded: formula !== null, connectionId, rawRecords, datasetVersionId, semanticModelId, formula };
  }

  async load(principal: AnalyticsPrincipal, correlationId: string): Promise<SampleFarmStatusV1> {
    assertUnscoped(principal);
    let state = await this.status(principal);
    const connectionId = state.connectionId ?? (await this.writeSource(principal, correlationId));

    const hasSchema = await this.one(
      principal.tenantId,
      `SELECT 1 FROM gigalibs_analytics.discovered_source_schemas WHERE connection_id = $1 AND is_current`,
      [connectionId],
    );
    if (!hasSchema) await this.discovery.discoverSchema(principal, connectionId, SAMPLE_FARM_TABLE, 5000);

    const mapping = await this.one<{ id: string; version: number | null }>(
      principal.tenantId,
      `SELECT m.id, max(v.version_number) AS version
         FROM gigalibs_analytics.data_studio_mappings m
         LEFT JOIN gigalibs_analytics.studio_mapping_versions v ON v.mapping_id = m.id
        WHERE m.connection_id = $1
        GROUP BY m.id, m.created_at ORDER BY m.created_at LIMIT 1`,
      [connectionId],
    );
    const mappingId =
      mapping?.id ??
      (
        await this.discovery.createMapping(principal, {
          connectionId,
          displayName: SAMPLE_FARM_SOURCE_NAME,
          sourceTableName: SAMPLE_FARM_TABLE,
          fieldMappings: SAMPLE_FARM_FIELDS,
        })
      ).id;
    const mappingVersion =
      mapping?.version ??
      (await this.discovery.publishMappingVersion(principal, mappingId, { fieldMappings: SAMPLE_FARM_FIELDS })).latestVersionNumber!;

    state = await this.status(principal);
    let datasetVersionId = state.datasetVersionId;
    if (!datasetVersionId) {
      const built = await this.datasets.buildDatasetVersion(principal, { mappingId, mappingVersion });
      if (built.buildStatus !== 'READY') {
        throw new InternalServerErrorException(`The sample dataset build ended ${built.buildStatus}: ${built.buildError ?? 'no detail'}.`);
      }
      datasetVersionId = built.id;
    }

    const semanticModelId =
      state.semanticModelId ??
      (
        await this.datasets.createSemanticModel(principal, {
          datasetVersionId,
          displayName: SAMPLE_FARM_SOURCE_NAME,
          description: SAMPLE_FARM_DESCRIPTION,
          measures: SAMPLE_FARM_MEASURES,
        })
      ).id;

    const formula = state.formula
      ? await this.formulas.get(principal, state.formula.id)
      : await this.formulas.create(principal, { semanticModelId, name: FORMULA_NAME, definition: YIELD_PER_HECTARE });
    const draft = formula.versions.find((version) => version.state === 'DRAFT' && version.createdBy === principal.subject);
    if (draft) {
      await this.formulas.submit(principal, formula.id, draft.id, { reason: 'Sample farm: yield per hectare for the demonstration.' });
    }
    return this.status(principal);
  }

  /** The SYNTHETIC connection, one succeeded sync run and the raw records, in one transaction. */
  private async writeSource(principal: AnalyticsPrincipal, correlationId: string): Promise<string> {
    const rows = generateSampleFarmHarvests();
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const connection = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.source_connections
           (tenant_id, display_name, source_type, host, port, database_name, ssl_mode, status, created_by)
         VALUES ($1, $2, 'SYNTHETIC', 'sample.invalid', 1, $3, 'disable', 'ACTIVE', $4)
         RETURNING id`,
        [principal.tenantId, SAMPLE_FARM_SOURCE_NAME, SAMPLE_FARM_TABLE, principal.subject],
      );
      const connectionId = connection.rows[0]!.id;
      const run = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.source_sync_runs (connection_id, tenant_id, status, rows_fetched, completed_at)
         VALUES ($1, $2, 'SUCCEEDED', $3, now())
         RETURNING id`,
        [connectionId, principal.tenantId, rows.length],
      );
      const syncRunId = run.rows[0]!.id;
      for (let offset = 0; offset < rows.length; offset += 200) {
        const batch = rows.slice(offset, offset + 200);
        const values: unknown[] = [];
        const placeholders = batch.map((row, index) => {
          const p = index * 6;
          values.push(syncRunId, connectionId, principal.tenantId, SAMPLE_FARM_TABLE, pkHash(row.record_id), JSON.stringify(row));
          return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}::jsonb)`;
        });
        await client.query(
          `INSERT INTO gigalibs_analytics.raw_record_versions
             (sync_run_id, connection_id, tenant_id, source_table_name, source_pk_hash, raw_payload)
           VALUES ${placeholders.join(', ')}`,
          values,
        );
      }
      await client.query(
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload, correlation_id)
         VALUES ($1, 'DEMO_SOURCE_LOADED', $2, $3, 'SOURCE_CONNECTION', $4::jsonb, $5)`,
        [
          principal.tenantId,
          principal.subject,
          connectionId,
          JSON.stringify({ source: SAMPLE_FARM_SOURCE_NAME, table: SAMPLE_FARM_TABLE, rawRecords: rows.length, syncRunId }),
          correlationId,
        ],
      );
      return connectionId;
    });
  }

  private async one<T extends Record<string, unknown>>(tenantId: string, sql: string, params: unknown[]): Promise<T | null> {
    const result = await this.db.queryWithTenant<T>(tenantId, sql, params);
    return result.rows[0] ?? null;
  }
}

function latestVersion(formula: FormulaMeasureV1): SampleFarmStatusV1['formula'] {
  const version = [...formula.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return version ? { id: formula.id, versionId: version.id, state: version.state } : null;
}

function pkHash(recordId: string): string {
  return createHash('sha256').update(`${SAMPLE_FARM_TABLE}:${recordId}`, 'utf8').digest('hex');
}

export interface SampleFarmHarvest {
  record_id: string;
  farm: string;
  field: string;
  crop: string;
  season: string;
  harvest_date: string;
  area_ha: number;
  yield_kg: number;
  input_cost_inr: number;
  latitude: number;
  longitude: number;
  data_origin: 'SYNTHETIC';
}

const FARMS = [
  { code: 'N', name: 'Sample Farm North', latitude: 16.58, longitude: 80.52, factor: 1.08 },
  { code: 'R', name: 'Sample Farm River', latitude: 16.44, longitude: 80.71, factor: 1.0 },
  { code: 'H', name: 'Sample Farm Hill', latitude: 16.31, longitude: 80.46, factor: 0.9 },
] as const;

/** Typical kg per hectare and input cost (INR) per hectare; illustrative values, not agronomic advice. */
const CROPS = {
  Rice: { yield: 5200, cost: 55_000 },
  Maize: { yield: 5800, cost: 48_000 },
  Cotton: { yield: 1800, cost: 60_000 },
  Wheat: { yield: 3500, cost: 42_000 },
  Chickpea: { yield: 1100, cost: 30_000 },
} as const;
type Crop = keyof typeof CROPS;

const SEASONS: Array<{ name: string; harvestStart: string; crops: readonly Crop[]; factor: number }> = [
  { name: 'Kharif 2024', harvestStart: '2024-10-01', crops: ['Rice', 'Maize', 'Cotton', 'Rice'], factor: 0.95 },
  { name: 'Rabi 2024-25', harvestStart: '2025-03-01', crops: ['Wheat', 'Chickpea', 'Maize', 'Wheat'], factor: 1.0 },
  { name: 'Kharif 2025', harvestStart: '2025-10-01', crops: ['Rice', 'Cotton', 'Maize', 'Rice'], factor: 1.05 },
  { name: 'Rabi 2025-26', harvestStart: '2026-03-01', crops: ['Wheat', 'Maize', 'Chickpea', 'Wheat'], factor: 0.98 },
];

const FIELDS_PER_FARM = 4;
const HARVEST_DAYS = 20;

/**
 * Deterministic synthetic harvest logs: 3 farms x 4 fields x 4 seasons x 20 harvest days = 960 records. The same seed
 * always yields the same rows, so a reload never changes the numbers shown in a demonstration.
 */
export function generateSampleFarmHarvests(seed = 20260929): SampleFarmHarvest[] {
  const random = mulberry32(seed);
  const rows: SampleFarmHarvest[] = [];
  for (const farm of FARMS) {
    for (let fieldIndex = 0; fieldIndex < FIELDS_PER_FARM; fieldIndex += 1) {
      const field = `${farm.code}-F${fieldIndex + 1}`;
      const fieldArea = 6 + Math.round(random() * 90) / 10;
      const latitude = round(farm.latitude + (fieldIndex % 2) * 0.012 - 0.006, 4);
      const longitude = round(farm.longitude + Math.floor(fieldIndex / 2) * 0.014 - 0.007, 4);
      for (const season of SEASONS) {
        const crop = season.crops[(fieldIndex + FARMS.indexOf(farm)) % season.crops.length]!;
        const start = Date.parse(`${season.harvestStart}T00:00:00Z`) + fieldIndex * 3 * 86_400_000;
        for (let day = 0; day < HARVEST_DAYS; day += 1) {
          const area = round((fieldArea / HARVEST_DAYS) * (0.8 + random() * 0.4), 2);
          const perHectare = CROPS[crop].yield * farm.factor * season.factor * (0.85 + random() * 0.3);
          rows.push({
            record_id: `SF-${field}-${season.name.replace(/\W+/g, '')}-${String(day + 1).padStart(2, '0')}`,
            farm: farm.name,
            field,
            crop,
            season: season.name,
            harvest_date: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
            area_ha: area,
            yield_kg: Math.round(area * perHectare),
            input_cost_inr: Math.round(area * CROPS[crop].cost * (0.9 + random() * 0.2)),
            latitude,
            longitude,
            data_origin: 'SYNTHETIC',
          });
        }
      }
    }
  }
  return rows;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
