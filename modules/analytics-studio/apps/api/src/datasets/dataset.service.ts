import { type FieldUnitConversion, convertUnit, normalizeUnit } from '@gigalibs/contracts';
import { readSourceField } from '../schema-discovery/schema-discovery.service.js';
import { PlaceTagger } from './place-tagger.js';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { organizationReplica, UNMATCHED_UNIT } from '../organization/organization-scope.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildDatasetDto {
  mappingId: string;
  /** Must match a PUBLISHED mapping version number; omitted, the latest one (WI-OI-104e scheduled rebuilds). */
  mappingVersion?: number;
}

export interface DatasetVersionSummary {
  id: string;
  mappingId: string;
  mappingVersion: number;
  tenantId: string;
  versionNumber: number;
  buildStatus: 'BUILDING' | 'READY' | 'FAILED';
  recordCount: number;
  contentChecksum: string | null;
  buildError: string | null;
  builtBy: string;
  builtAt: string;
  completedAt: string | null;
  /** WI-OI-104e: semantic models moved to this version by this build (same mapping version, so the same fields). */
  refreshedModelIds?: string[];
  /** WI-OI-105c: records no place contained or matched (the dataset's "Unplaced" bucket). */
  unplacedCount?: number;
}

export interface SemanticMeasureDto {
  measureName: string;
  aggregateFn: 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT' | 'MIN' | 'MAX';
  fieldReference: string;
  displayLabel: string;
  description?: string;
}

export interface CreateSemanticModelDto {
  datasetVersionId: string;
  displayName: string;
  description?: string;
  measures: SemanticMeasureDto[];
}

export interface SemanticModelSummary {
  id: string;
  datasetVersionId: string;
  tenantId: string;
  displayName: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  measures: Array<{
    id: string;
    measureName: string;
    aggregateFn: string;
    fieldReference: string;
    displayLabel: string;
  }>;
  latestVersionNumber: number | null;
}

// ─── DatasetService ───────────────────────────────────────────────────────────

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Build a new analytical dataset version from a PUBLISHED mapping.
   *
   * The build reads raw_record_versions filtered to the mapping's
   * source table and connection, applies field transformations defined
   * by the mapping version, writes dataset_record_versions (append-only),
   * and marks the dataset READY.
   *
   * Transform logic is intentionally simple in Phase 4: type coercion
   * only (cast to declared analyticalType). Expressions and computed
   * fields are Phase 5+ (semantic measures handle aggregation).
   */
  async buildDatasetVersion(
    principal: AnalyticsPrincipal,
    dto: BuildDatasetDto,
  ): Promise<DatasetVersionSummary> {
    const { tenantId, subject } = principal;

    if (dto.mappingVersion === undefined) {
      const latest = await this.db.queryWithTenant<{ version_number: number }>(
        tenantId,
        `SELECT max(version_number) AS version_number FROM gigalibs_analytics.studio_mapping_versions WHERE mapping_id = $1`,
        [dto.mappingId],
      );
      const version = latest.rows[0]?.version_number;
      if (!version) throw new NotFoundException(`Mapping '${dto.mappingId}' has no published version.`);
      dto = { ...dto, mappingVersion: Number(version) };
    }

    // Verify the mapping exists and belongs to tenant
    const mappingResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT m.id, m.connection_id, m.source_table_name, m.lifecycle,
              mv.field_mappings, mv.version_number, mv.content_hash
       FROM gigalibs_analytics.data_studio_mappings m
       JOIN gigalibs_analytics.studio_mapping_versions mv
         ON mv.mapping_id = m.id AND mv.version_number = $2
       WHERE m.id = $1`,
      [dto.mappingId, dto.mappingVersion],
    );

    if (mappingResult.rows.length === 0) {
      throw new NotFoundException(
        `Mapping '${dto.mappingId}' at version ${dto.mappingVersion} not found.`,
      );
    }

    const mapping = mappingResult.rows[0]!;

    if (mapping.lifecycle !== 'PUBLISHED') {
      throw new BadRequestException(
        `Mapping '${dto.mappingId}' is not PUBLISHED (lifecycle=${mapping.lifecycle}). ` +
          'Only PUBLISHED mappings can produce datasets.',
      );
    }

    const fieldMappings: Array<{
      sourceField: string;
      analyticalField: string;
      analyticalType: string;
      unit?: FieldUnitConversion;
      place?: { longitudeField: string } | { byCode: true };
    }> = Array.isArray(mapping.field_mappings)
      ? mapping.field_mappings
      : JSON.parse(mapping.field_mappings);

    let refreshedModelIds: string[] = [];
    let ready = false;

    // Create dataset version record (BUILDING)
    const versionResult = await this.db.queryWithTenant<{ id: string; version_number: number }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.analytical_dataset_versions
         (mapping_id, mapping_version, tenant_id, version_number,
          build_status, record_count, built_by)
       VALUES (
         $1, $2, $3,
         COALESCE((
           SELECT MAX(version_number) + 1
           FROM gigalibs_analytics.analytical_dataset_versions
           WHERE mapping_id = $1
         ), 1),
         'BUILDING', 0, $4
       )
       RETURNING id, version_number`,
      [dto.mappingId, dto.mappingVersion, tenantId, subject],
    );

    const datasetVersionId = versionResult.rows[0]!.id;
    const versionNumber = versionResult.rows[0]!.version_number;

    this.logger.log(
      `[tenant:${tenantId}] Building dataset version ${versionNumber} ` +
        `for mapping '${dto.mappingId}' v${dto.mappingVersion}`,
    );

    try {
      const { recordCount, checksum, unplacedCount: unplacedInBuild } = await this.transformAndWrite(
        tenantId,
        datasetVersionId,
        dto.mappingId,
        mapping.connection_id,
        mapping.source_table_name,
        fieldMappings,
      );

      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.analytical_dataset_versions
         SET build_status = 'READY', record_count = $2,
             content_checksum = $3, unplaced_count = $4, completed_at = now()
         WHERE id = $1`,
        [datasetVersionId, recordCount, checksum, unplacedInBuild ?? null],
      );

      this.logger.log(
        `[tenant:${tenantId}] Dataset version ${versionNumber} READY: ` +
          `${recordCount} records, checksum=${checksum.slice(0, 8)}…`,
      );
      ready = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_analytics.analytical_dataset_versions
         SET build_status = 'FAILED', build_error = $2, completed_at = now()
         WHERE id = $1`,
        [datasetVersionId, msg],
      );
      this.logger.error(`[tenant:${tenantId}] Dataset version ${versionNumber} FAILED: ${msg}`);
    }

    // The dataset is complete whatever happens next: a failed model move is logged, never turns the build FAILED.
    if (ready) {
      refreshedModelIds = await this.refreshModels(principal, dto.mappingId, dto.mappingVersion!, datasetVersionId).catch((err: unknown) => {
        this.logger.error(`[tenant:${tenantId}] Models were not moved to dataset ${datasetVersionId}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      });
    }
    const built = await this.getDatasetVersion(principal, datasetVersionId);
    return {
      ...built,
      ...(refreshedModelIds.length > 0 ? { refreshedModelIds } : {}),
    };
  }

  /**
   * WI-OI-104e: the semantic models on an older build of the same mapping version (identical fields) move to the new
   * version, so saved charts and dashboards show the new data; each move is audited. Models on another mapping
   * version stay where they are until someone moves them.
   */
  private async refreshModels(principal: AnalyticsPrincipal, mappingId: string, mappingVersion: number, datasetVersionId: string): Promise<string[]> {
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const moved = await client.query<{ id: string; previous: string }>(
        `WITH previous AS (
           SELECT sm.id, sm.dataset_version_id AS previous
             FROM gigalibs_analytics.semantic_models sm
             JOIN gigalibs_analytics.analytical_dataset_versions dv ON dv.id = sm.dataset_version_id
            WHERE dv.mapping_id = $1 AND dv.mapping_version = $2 AND dv.id <> $3
            FOR UPDATE OF sm)
         UPDATE gigalibs_analytics.semantic_models sm
            SET dataset_version_id = $3, updated_at = now()
           FROM previous
          WHERE sm.id = previous.id
          RETURNING sm.id, previous.previous`,
        [mappingId, mappingVersion, datasetVersionId],
      );
      for (const model of moved.rows) {
        await client.query(
          `INSERT INTO gigalibs_analytics.analytics_audit_log
             (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
           VALUES ($1, 'SEMANTIC_MODEL_REFRESHED'::gigalibs_analytics.audit_event_type, $2, $3, 'SEMANTIC_MODEL', $4::jsonb)`,
          [principal.tenantId, principal.subject, model.id, JSON.stringify({ fromDatasetVersionId: model.previous, toDatasetVersionId: datasetVersionId, mappingId, mappingVersion })],
        );
      }
      return moved.rows.map((model) => model.id);
    });
  }

  async getDatasetVersion(
    principal: AnalyticsPrincipal,
    datasetVersionId: string,
  ): Promise<DatasetVersionSummary> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, mapping_id, mapping_version, tenant_id, version_number,
              build_status, record_count, content_checksum, build_error, unplaced_count,
              built_by, built_at::text, completed_at::text
       FROM gigalibs_analytics.analytical_dataset_versions
       WHERE id = $1`,
      [datasetVersionId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Dataset version '${datasetVersionId}' not found.`);
    }
    return this.toDatasetSummary(result.rows[0]!);
  }

  async listDatasetVersions(
    principal: AnalyticsPrincipal,
    mappingId: string,
  ): Promise<DatasetVersionSummary[]> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, mapping_id, mapping_version, tenant_id, version_number,
              build_status, record_count, content_checksum, build_error, unplaced_count,
              built_by, built_at::text, completed_at::text
       FROM gigalibs_analytics.analytical_dataset_versions
       WHERE mapping_id = $1
       ORDER BY version_number DESC`,
      [mappingId],
    );
    return result.rows.map((r: any) => this.toDatasetSummary(r));
  }

  // ── Semantic Model operations ─────────────────────────────────────────────

  async createSemanticModel(
    principal: AnalyticsPrincipal,
    dto: CreateSemanticModelDto,
  ): Promise<SemanticModelSummary> {
    const { tenantId, subject } = principal;

    this.validateMeasures(dto.measures);

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Verify dataset version exists + belongs to tenant
      const dvResult = await client.query<{ id: string; build_status: string }>(
        `SELECT id, build_status FROM gigalibs_analytics.analytical_dataset_versions WHERE id = $1`,
        [dto.datasetVersionId],
      );
      if (dvResult.rows.length === 0) {
        throw new NotFoundException(`Dataset version '${dto.datasetVersionId}' not found.`);
      }
      if (dvResult.rows[0]!.build_status !== 'READY') {
        throw new BadRequestException(
          `Dataset version '${dto.datasetVersionId}' is not READY (status=${dvResult.rows[0]!.build_status}).`,
        );
      }

      // Create model
      const modelResult = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.semantic_models
           (dataset_version_id, tenant_id, display_name, description, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [dto.datasetVersionId, tenantId, dto.displayName, dto.description ?? null, subject],
      );
      const modelId = modelResult.rows[0]!.id;

      // Insert measures
      for (const m of dto.measures) {
        await client.query(
          `INSERT INTO gigalibs_analytics.semantic_measures
             (model_id, tenant_id, measure_name, aggregate_fn, field_reference, display_label, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [modelId, tenantId, m.measureName, m.aggregateFn, m.fieldReference, m.displayLabel, m.description ?? null],
        );
      }

      // Save initial immutable version
      const measuresSnapshot = JSON.stringify(dto.measures);
      const contentHash = crypto.createHash('sha256').update(measuresSnapshot, 'utf8').digest('hex');
      await client.query(
        `INSERT INTO gigalibs_analytics.semantic_model_versions
           (model_id, tenant_id, version_number, measures_snapshot, content_hash, saved_by)
         VALUES ($1, $2, 1, $3, $4, $5)`,
        [modelId, tenantId, measuresSnapshot, contentHash, subject],
      );

      this.logger.log(`[tenant:${tenantId}] Created semantic model '${modelId}' with ${dto.measures.length} measures`);

      return this.getSemanticModel(principal, modelId, client);
    });
  }

  async getSemanticModel(
    principal: AnalyticsPrincipal,
    modelId: string,
    client?: any,
  ): Promise<SemanticModelSummary> {
    const { tenantId } = principal;

    const query = (sql: string, params: unknown[]) =>
      client
        ? client.query(sql, params)
        : this.db.queryWithTenant(tenantId, sql, params);

    const modelResult = await query(
      `SELECT id, dataset_version_id, tenant_id, display_name, description,
              created_by, created_at::text, updated_at::text
       FROM gigalibs_analytics.semantic_models WHERE id = $1`,
      [modelId],
    );
    if (modelResult.rows.length === 0) throw new NotFoundException(`Semantic model '${modelId}' not found.`);

    const model = modelResult.rows[0]!;

    const measuresResult = await query(
      `SELECT id, measure_name, aggregate_fn, field_reference, display_label
       FROM gigalibs_analytics.semantic_measures WHERE model_id = $1 ORDER BY measure_name`,
      [modelId],
    );

    const versionResult = await query(
      `SELECT version_number FROM gigalibs_analytics.semantic_model_versions
       WHERE model_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [modelId],
    );

    return {
      id: model.id,
      datasetVersionId: model.dataset_version_id,
      tenantId: model.tenant_id,
      displayName: model.display_name,
      description: model.description ?? null,
      createdBy: model.created_by,
      createdAt: model.created_at,
      updatedAt: model.updated_at,
      measures: measuresResult.rows.map((r: any) => ({
        id: r.id,
        measureName: r.measure_name,
        aggregateFn: r.aggregate_fn,
        fieldReference: r.field_reference,
        displayLabel: r.display_label,
      })),
      latestVersionNumber: versionResult.rows[0]?.version_number ?? null,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async transformAndWrite(
    tenantId: string,
    datasetVersionId: string,
    mappingId: string,
    connectionId: string,
    sourceTableName: string,
    fieldMappings: Array<{
      sourceField: string;
      analyticalField: string;
      analyticalType: string;
      unit?: FieldUnitConversion;
      place?: { longitudeField: string } | { byCode: true };
      organizationUnit?: { match: 'CODE' | 'ID' };
    }>,
  ): Promise<{ recordCount: number; checksum: string; unplacedCount?: number }> {
    // Read most recent raw records for this connection + table (all of them)
    const rawResult = await this.db.queryWithTenant<{
      raw_payload: Record<string, unknown>;
      source_pk_hash: string;
    }>(
      tenantId,
      `SELECT DISTINCT ON (source_pk_hash) raw_payload, source_pk_hash
       FROM gigalibs_analytics.raw_record_versions
       WHERE connection_id = $1 AND source_table_name = $2
       ORDER BY source_pk_hash, ingested_at DESC`,
      [connectionId, sourceTableName],
    );

    const rawRows = rawResult.rows;

    if (rawRows.length === 0) {
      return {
        recordCount: 0,
        checksum: crypto.createHash('sha256').update('empty').digest('hex'),
        ...(fieldMappings.some((mapping) => mapping.place) ? { unplacedCount: 0 } : {}),
      };
    }

    // Transform each raw row: pick declared source fields (dot paths reach nested records), cast to analyticalType,
    // and convert units (WI-OI-104e). A value whose unit is unknown or of another kind becomes null, never a guess.
    let unconverted = 0;
    // WI-OI-105c: a place field is filled from the place directory; unmatched records are "Unplaced".
    const placeEntry = fieldMappings.find((mapping) => mapping.place);
    const tagger = placeEntry ? await PlaceTagger.load(this.db, tenantId) : null;
    let unplaced = 0;
    // WI-OI-109e3: a unit field is matched against Analytics' copy of the organization (newest held primary version).
    const unitEntry = fieldMappings.find((mapping) => mapping.organizationUnit);
    const unitsByCode = unitEntry
      ? await organizationReplica.unitsByCode({ query: (text: string, values?: unknown[]) => this.db.queryWithTenant(tenantId, text, values as unknown[]) } as never, tenantId)
      : new Map<string, { id: string; name: string }>();
    const unitsById = new Map([...unitsByCode.values()].map((unit) => [unit.id, unit]));
    const analyticalRows = rawRows.map((r) => {
      const payload: Record<string, unknown> = {};
      if (unitEntry) {
        const raw = readSourceField(r.raw_payload, unitEntry.sourceField);
        const value = raw === null || raw === undefined ? '' : String(raw).trim();
        const found = value === '' ? null : unitEntry.organizationUnit!.match === 'CODE' ? unitsByCode.get(value) : unitsById.get(value);
        // Empty: tenant-shared. Unknown: kept from everyone but tenant-wide members, never widened.
        payload[unitEntry.analyticalField] = value === '' ? 'Shared' : found?.name ?? 'Unknown unit';
        payload.unit_id = value === '' ? null : found?.id ?? UNMATCHED_UNIT;
      }
      if (placeEntry && tagger) {
        const place = placeEntry.place!;
        const found = 'longitudeField' in place
          ? tagger.byPoint(readSourceField(r.raw_payload, placeEntry.sourceField), readSourceField(r.raw_payload, place.longitudeField))
          : tagger.byCode(readSourceField(r.raw_payload, placeEntry.sourceField));
        if (!found) unplaced += 1;
        payload[placeEntry.analyticalField] = found?.name ?? 'Unplaced';
        payload.place_id = found?.id ?? null;
        payload.place_path = found?.path ?? null;
      }
      for (const mapping of fieldMappings) {
        if (mapping === placeEntry || mapping === unitEntry) continue;
        const rawValue = readSourceField(r.raw_payload, mapping.sourceField);
        let value = castToType(rawValue, mapping.analyticalType);
        if (mapping.unit && typeof value === 'number') {
          const from = mapping.unit.from ?? normalizeUnit(readSourceField(r.raw_payload, mapping.unit.fromField ?? ''));
          const converted = from ? convertUnit(value, from, mapping.unit.to) : null;
          if (converted === null) unconverted += 1;
          value = converted;
        }
        payload[mapping.analyticalField] = value;
      }
      return { analytical_payload: payload, source_pk_hash: r.source_pk_hash };
    });
    if (unconverted > 0) {
      this.logger.warn(`[tenant:${tenantId}] dataset ${datasetVersionId}: ${unconverted} value(s) had an unknown or mismatched unit and were left empty.`);
    }

    // Batch-insert into dataset_record_versions (append-only)
    const BATCH = 200;
    for (let offset = 0; offset < analyticalRows.length; offset += BATCH) {
      const batch = analyticalRows.slice(offset, offset + BATCH);
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let p = 1;
      for (const row of batch) {
        placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        // source_pk_hash is required (migration 000007) and links each record to its raw source row for lineage.
        values.push(datasetVersionId, mappingId, tenantId, JSON.stringify(row.analytical_payload), row.source_pk_hash);
      }
      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_analytics.dataset_record_versions
           (dataset_version_id, mapping_id, tenant_id, analytical_payload, source_pk_hash)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    // Compute content checksum: hash of field names + record count
    const checksumInput = JSON.stringify({
      fields: fieldMappings.map((f) => f.analyticalField).sort(),
      recordCount: analyticalRows.length,
    });
    const checksum = crypto.createHash('sha256').update(checksumInput, 'utf8').digest('hex');

    return { recordCount: analyticalRows.length, checksum, ...(placeEntry ? { unplacedCount: unplaced } : {}) };
  }

  private validateMeasures(measures: SemanticMeasureDto[]): void {
    if (!Array.isArray(measures) || measures.length === 0) {
      throw new BadRequestException('measures must be a non-empty array.');
    }
    const VALID_AGG = new Set(['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX']);
    const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;
    const seen = new Set<string>();
    for (const m of measures) {
      if (!NAME_RE.test(m.measureName)) {
        throw new BadRequestException(`Invalid measureName: '${m.measureName}'.`);
      }
      if (!VALID_AGG.has(m.aggregateFn)) {
        throw new BadRequestException(`Invalid aggregateFn '${m.aggregateFn}'.`);
      }
      if (!NAME_RE.test(m.fieldReference)) {
        throw new BadRequestException(`Invalid fieldReference: '${m.fieldReference}'.`);
      }
      if (seen.has(m.measureName)) {
        throw new BadRequestException(`Duplicate measureName: '${m.measureName}'.`);
      }
      seen.add(m.measureName);
    }
  }

  private toDatasetSummary(row: Record<string, unknown>): DatasetVersionSummary {
    return {
      id: row['id'] as string,
      mappingId: row['mapping_id'] as string,
      mappingVersion: Number(row['mapping_version']),
      tenantId: row['tenant_id'] as string,
      versionNumber: Number(row['version_number']),
      buildStatus: row['build_status'] as 'BUILDING' | 'READY' | 'FAILED',
      recordCount: Number(row['record_count'] ?? 0),
      contentChecksum: (row['content_checksum'] as string | null) ?? null,
      buildError: (row['build_error'] as string | null) ?? null,
      builtBy: row['built_by'] as string,
      builtAt: row['built_at'] as string,
      completedAt: (row['completed_at'] as string | null) ?? null,
      ...(row['unplaced_count'] != null ? { unplacedCount: Number(row['unplaced_count']) } : {}),
    };
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function castToType(value: unknown, analyticalType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (analyticalType) {
    case 'number':
      return typeof value === 'number' ? value : Number(value);
    case 'boolean':
      return value === true || value === 'true' || value === 1;
    case 'string':
    case 'date':
    case 'timestamp':
      return String(value);
    default:
      return value;
  }
}
