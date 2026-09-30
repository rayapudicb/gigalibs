import { ANALYTICS_UNITS, type FieldUnitConversion, isAnalyticsUnit } from '@gigalibs/contracts';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import { ConnectorService } from '../connectors/connector.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredSchema {
  id: string;
  connectionId: string;
  tenantId: string;
  sourceTableName: string;
  estimatedRowCount: number | null;
  discoveredAt: string;
  isCurrent: boolean;
  fields: FieldProfile[];
}

export interface FieldProfile {
  id: string;
  fieldName: string;
  inferredType: string;
  nonNullRatio: number | null;
  distinctCount: number | null;
  sampleMin: string | null;
  sampleMax: string | null;
  profiledAt: string;
}

export interface FieldMappingEntry {
  /** A top-level field, or a dot path into nested records (WI-OI-104e), for example `attributes.quantity`. */
  sourceField: string;
  analyticalField: string;
  analyticalType: 'string' | 'number' | 'boolean' | 'date' | 'timestamp';
  transformHint?: string;
  /** WI-OI-104e: number fields may convert to one unit, from a fixed unit or from the unit named in another field. */
  unit?: FieldUnitConversion;
}

/** A source field: a name, or a dot path of up to five segments into nested records. */
export const SOURCE_FIELD_PATH = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}(\.[a-zA-Z0-9_]{1,63}){0,4}$/;

export interface CreateMappingDto {
  connectionId: string;
  displayName: string;
  sourceTableName: string;
  fieldMappings: FieldMappingEntry[];
}

export interface PublishMappingDto {
  fieldMappings: FieldMappingEntry[];
}

export interface MappingSummary {
  id: string;
  connectionId: string;
  tenantId: string;
  displayName: string;
  sourceTableName: string;
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  latestVersionNumber: number | null;
  latestContentHash: string | null;
  /** WI-OI-104e: the latest published field mappings, for the Sources screen's measures. */
  latestFieldMappings?: FieldMappingEntry[];
}

// ─── SchemaDiscoveryService ───────────────────────────────────────────────────

@Injectable()
export class SchemaDiscoveryService {
  private readonly logger = new Logger(SchemaDiscoveryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly connectorService: ConnectorService,
  ) {}

  /**
   * Discover the schema of a source table by sampling raw_record_versions.
   * This never touches the external source — it reads what the ingestion
   * engine already captured. Safe to call at any time.
   *
   * Discovery reads the most recent N raw records for the given table and
   * infers field names, types, nullability and basic quality metrics.
   */
  async discoverSchema(
    principal: AnalyticsPrincipal,
    connectionId: string,
    sourceTableName: string,
    sampleSize = 1000,
  ): Promise<DiscoveredSchema> {
    const { tenantId, subject } = principal;

    this.validateIdentifier(sourceTableName, 'sourceTableName');

    // Confirm connection belongs to tenant
    await this.connectorService.getConnection(principal, connectionId);

    // Sample raw records for this connection + table
    const sampleResult = await this.db.queryWithTenant<{ raw_payload: Record<string, unknown> }>(
      tenantId,
      `SELECT raw_payload
       FROM gigalibs_analytics.raw_record_versions
       WHERE connection_id = $1 AND source_table_name = $2
       ORDER BY ingested_at DESC
       LIMIT $3`,
      [connectionId, sourceTableName, Math.min(sampleSize, 5000)],
    );

    const rows = sampleResult.rows.map((r) => r.raw_payload);

    if (rows.length === 0) {
      throw new BadRequestException(
        `No raw records found for table '${sourceTableName}' on connection '${connectionId}'. ` +
          'Run a sync first to populate raw records before discovering schema.',
      );
    }

    // Profile fields from sampled rows
    const fieldProfiles = this.profileFields(rows);

    // Mark any existing current schema as superseded
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_analytics.discovered_source_schemas
       SET is_current = false
       WHERE connection_id = $1 AND source_table_name = $2 AND is_current = true`,
      [connectionId, sourceTableName],
    );

    // Insert new schema record
    const schemaResult = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.discovered_source_schemas
         (connection_id, tenant_id, source_table_name, estimated_row_count, is_current)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [connectionId, tenantId, sourceTableName, rows.length],
    );
    const schemaId = schemaResult.rows[0]!.id;

    // Insert field profiles
    if (fieldProfiles.length > 0) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let p = 1;
      for (const fp of fieldProfiles) {
        placeholders.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
        );
        values.push(
          schemaId,
          connectionId,
          tenantId,
          fp.fieldName,
          fp.inferredType,
          fp.nonNullRatio,
          fp.distinctCount,
          fp.sampleMin,
          fp.sampleMax,
        );
      }
      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_analytics.source_field_profiles
           (schema_id, connection_id, tenant_id, field_name, inferred_type,
            non_null_ratio, distinct_count, sample_min, sample_max)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    this.logger.log(
      `[tenant:${tenantId}] Schema discovered for ${connectionId}/${sourceTableName}: ` +
        `${fieldProfiles.length} fields from ${rows.length} sample rows`,
    );

    return this.getSchema(principal, schemaId);
  }

  async getSchema(
    principal: AnalyticsPrincipal,
    schemaId: string,
  ): Promise<DiscoveredSchema> {
    const { tenantId } = principal;

    const schemaResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, connection_id, tenant_id, source_table_name,
              estimated_row_count, discovered_at::text, is_current
       FROM gigalibs_analytics.discovered_source_schemas
       WHERE id = $1`,
      [schemaId],
    );

    if (schemaResult.rows.length === 0) {
      throw new NotFoundException(`Schema '${schemaId}' not found.`);
    }

    const schema = schemaResult.rows[0]!;

    const fieldsResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, field_name, inferred_type, non_null_ratio, distinct_count,
              sample_min, sample_max, profiled_at::text
       FROM gigalibs_analytics.source_field_profiles
       WHERE schema_id = $1
       ORDER BY field_name ASC`,
      [schemaId],
    );

    return {
      id: schema.id,
      connectionId: schema.connection_id,
      tenantId: schema.tenant_id,
      sourceTableName: schema.source_table_name,
      estimatedRowCount: schema.estimated_row_count ? Number(schema.estimated_row_count) : null,
      discoveredAt: schema.discovered_at,
      isCurrent: schema.is_current,
      fields: fieldsResult.rows.map((r: any) => ({
        id: r.id,
        fieldName: r.field_name,
        inferredType: r.inferred_type,
        nonNullRatio: r.non_null_ratio !== null ? Number(r.non_null_ratio) : null,
        distinctCount: r.distinct_count !== null ? Number(r.distinct_count) : null,
        sampleMin: r.sample_min,
        sampleMax: r.sample_max,
        profiledAt: r.profiled_at,
      })),
    };
  }

  // ── Data Studio Mapping operations ───────────────────────────────────────

  async createMapping(
    principal: AnalyticsPrincipal,
    dto: CreateMappingDto,
  ): Promise<MappingSummary> {
    const { tenantId, subject } = principal;

    this.validateIdentifier(dto.sourceTableName, 'sourceTableName');
    this.validateFieldMappings(dto.fieldMappings);

    await this.connectorService.getConnection(principal, dto.connectionId);

    const result = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_analytics.data_studio_mappings
         (connection_id, tenant_id, display_name, source_table_name, lifecycle, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5)
       RETURNING id`,
      [dto.connectionId, tenantId, dto.displayName, dto.sourceTableName, subject],
    );

    const mappingId = result.rows[0]!.id;

    this.logger.log(`[tenant:${tenantId}] Created Data Studio mapping '${mappingId}'`);
    return this.getMappingSummary(tenantId, mappingId);
  }

  /**
   * Publish a mapping version. Publishing is immutable — once a version is
   * recorded in studio_mapping_versions it can never be modified.
   * Preview is allowed on DRAFT mappings only; publishing transitions to PUBLISHED.
   */
  async publishMappingVersion(
    principal: AnalyticsPrincipal,
    mappingId: string,
    dto: PublishMappingDto,
  ): Promise<MappingSummary> {
    const { tenantId, subject } = principal;

    this.validateFieldMappings(dto.fieldMappings);

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Lock the mapping row
      const mappingResult = await client.query<any>(
        `SELECT id, lifecycle FROM gigalibs_analytics.data_studio_mappings WHERE id = $1 FOR UPDATE`,
        [mappingId],
      );
      if (mappingResult.rows.length === 0) {
        throw new NotFoundException(`Mapping '${mappingId}' not found.`);
      }
      const mapping = mappingResult.rows[0]!;
      if (mapping.lifecycle === 'ARCHIVED') {
        throw new BadRequestException(`Mapping '${mappingId}' is ARCHIVED and cannot be published.`);
      }

      // Compute next version number
      const versionResult = await client.query<{ max_version: number }>(
        `SELECT COALESCE(MAX(version_number), 0) AS max_version
         FROM gigalibs_analytics.studio_mapping_versions
         WHERE mapping_id = $1`,
        [mappingId],
      );
      const nextVersion = (versionResult.rows[0]?.max_version ?? 0) + 1;

      // Compute deterministic content hash
      const canonicalJson = JSON.stringify(
        [...dto.fieldMappings].sort((a, b) => a.sourceField.localeCompare(b.sourceField)),
      );
      const contentHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

      // Insert immutable version record (REVOKE UPDATE/DELETE enforced by migration)
      await client.query(
        `INSERT INTO gigalibs_analytics.studio_mapping_versions
           (mapping_id, tenant_id, version_number, field_mappings, content_hash, published_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mappingId, tenantId, nextVersion, JSON.stringify(dto.fieldMappings), contentHash, subject],
      );

      // Transition lifecycle to PUBLISHED if DRAFT
      await client.query(
        `UPDATE gigalibs_analytics.data_studio_mappings
         SET lifecycle = 'PUBLISHED'
         WHERE id = $1 AND lifecycle = 'DRAFT'`,
        [mappingId],
      );

      this.logger.log(
        `[tenant:${tenantId}] Published mapping version ${nextVersion} for '${mappingId}' (hash=${contentHash.slice(0, 8)}…)`,
      );

      return this.getMappingSummary(tenantId, mappingId, client);
    });
  }

  /** WI-OI-104e: mappable sources, without connection details. */
  async listSources(principal: AnalyticsPrincipal): Promise<Array<{ id: string; displayName: string; sourceType: string; status: string }>> {
    const result = await this.db.queryWithTenant<{ id: string; display_name: string; source_type: string; status: string }>(
      principal.tenantId,
      `SELECT id, display_name, source_type::text, status::text FROM gigalibs_analytics.source_connections ORDER BY display_name`,
    );
    return result.rows.map((row) => ({ id: row.id, displayName: row.display_name, sourceType: row.source_type, status: row.status }));
  }

  async listMappings(principal: AnalyticsPrincipal): Promise<MappingSummary[]> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT m.id, m.connection_id, m.tenant_id, m.display_name, m.source_table_name,
              m.lifecycle, m.created_by, m.created_at::text, m.updated_at::text,
              mv.version_number AS latest_version_number,
              mv.content_hash   AS latest_content_hash,
              mv.field_mappings AS latest_field_mappings
       FROM gigalibs_analytics.data_studio_mappings m
       LEFT JOIN LATERAL (
         SELECT version_number, content_hash, field_mappings
         FROM gigalibs_analytics.studio_mapping_versions
         WHERE mapping_id = m.id
         ORDER BY version_number DESC LIMIT 1
       ) mv ON true
       ORDER BY m.created_at DESC`,
    );
    return result.rows.map((r: any) => this.toMappingSummary(r));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getMappingSummary(
    tenantId: string,
    mappingId: string,
    client?: any,
  ): Promise<MappingSummary> {
    const query = (sql: string, params: unknown[]) =>
      client
        ? client.query(sql, params)
        : this.db.queryWithTenant(tenantId, sql, params);

    const result = await query(
      `SELECT m.id, m.connection_id, m.tenant_id, m.display_name, m.source_table_name,
              m.lifecycle, m.created_by, m.created_at::text, m.updated_at::text,
              mv.version_number AS latest_version_number,
              mv.content_hash   AS latest_content_hash,
              mv.field_mappings AS latest_field_mappings
       FROM gigalibs_analytics.data_studio_mappings m
       LEFT JOIN LATERAL (
         SELECT version_number, content_hash, field_mappings
         FROM gigalibs_analytics.studio_mapping_versions
         WHERE mapping_id = m.id
         ORDER BY version_number DESC LIMIT 1
       ) mv ON true
       WHERE m.id = $1`,
      [mappingId],
    );

    if (result.rows.length === 0) throw new NotFoundException(`Mapping '${mappingId}' not found.`);
    return this.toMappingSummary(result.rows[0]!);
  }

  private toMappingSummary(row: Record<string, unknown>): MappingSummary {
    return {
      id: row['id'] as string,
      connectionId: row['connection_id'] as string,
      tenantId: row['tenant_id'] as string,
      displayName: row['display_name'] as string,
      sourceTableName: row['source_table_name'] as string,
      lifecycle: row['lifecycle'] as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
      createdBy: row['created_by'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      latestVersionNumber: row['latest_version_number'] != null ? Number(row['latest_version_number']) : null,
      latestContentHash: (row['latest_content_hash'] as string | null) ?? null,
      ...(row['latest_field_mappings'] != null
        ? { latestFieldMappings: (typeof row['latest_field_mappings'] === 'string' ? JSON.parse(row['latest_field_mappings'] as string) : row['latest_field_mappings']) as FieldMappingEntry[] }
        : {}),
    };
  }

  private validateIdentifier(value: string, field: string): void {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
      throw new BadRequestException(
        `${field} must be lowercase alphanumeric with underscores, starting with a letter.`,
      );
    }
  }

  private validateFieldMappings(mappings: FieldMappingEntry[]): void {
    if (!Array.isArray(mappings) || mappings.length === 0) {
      throw new BadRequestException('fieldMappings must be a non-empty array.');
    }
    const VALID_TYPES = new Set(['string', 'number', 'boolean', 'date', 'timestamp']);
    const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;
    for (const entry of mappings) {
      if (!SOURCE_FIELD_PATH.test(entry.sourceField)) {
        throw new BadRequestException(`Invalid sourceField name: '${entry.sourceField}'.`);
      }
      if (!FIELD_NAME_RE.test(entry.analyticalField)) {
        throw new BadRequestException(`Invalid analyticalField name: '${entry.analyticalField}'.`);
      }
      if (!VALID_TYPES.has(entry.analyticalType)) {
        throw new BadRequestException(
          `Invalid analyticalType '${entry.analyticalType}'. Must be one of: ${[...VALID_TYPES].join(', ')}.`,
        );
      }
      if (entry.unit !== undefined) validateUnitConversion(entry);
    }
    // Check for duplicate source fields
    const seen = new Set<string>();
    for (const entry of mappings) {
      if (seen.has(entry.sourceField)) {
        throw new BadRequestException(`Duplicate sourceField: '${entry.sourceField}'.`);
      }
      seen.add(entry.sourceField);
    }
  }

  /**
   * Profile fields from an array of raw record payloads.
   * Pure computation — never touches the database or external source.
   */
  private profileFields(rows: Record<string, unknown>[]): Omit<FieldProfile, 'id' | 'profiledAt'>[] {
    if (rows.length === 0) return [];

    // Collect all field names across all rows; nested objects are profiled as dot paths (WI-OI-104e).
    rows = rows.map((row) => flattenRecord(row));
    const allFields = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        allFields.add(key);
      }
    }

    return [...allFields].map((fieldName) => {
      const values = rows.map((r) => r[fieldName]);
      const nonNullValues = values.filter((v) => v !== null && v !== undefined);
      const nonNullRatio = Number((nonNullValues.length / rows.length).toFixed(4));

      // Infer type from first non-null value
      const inferredType = inferJsonType(nonNullValues[0]);

      // Distinct count
      const distinctSet = new Set(nonNullValues.map((v) => JSON.stringify(v)));
      const distinctCount = distinctSet.size;

      // Sample min/max (string comparison — adequate for profiling)
      const stringValues = nonNullValues
        .filter((v) => typeof v === 'string' || typeof v === 'number')
        .map((v) => String(v))
        .sort();
      const sampleMin = stringValues[0] ?? null;
      const sampleMax = stringValues[stringValues.length - 1] ?? null;

      return {
        fieldName,
        inferredType,
        nonNullRatio,
        distinctCount,
        sampleMin,
        sampleMax,
      };
    });
  }
}

function inferJsonType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/** WI-OI-104e: a unit conversion applies to number fields, to a known unit, from a known unit or a source field. */
function validateUnitConversion(entry: FieldMappingEntry): void {
  const unit = entry.unit as Partial<FieldUnitConversion> | null;
  if (!unit || typeof unit !== 'object') throw new BadRequestException(`The unit of '${entry.analyticalField}' must be an object.`);
  if (entry.analyticalType !== 'number') throw new BadRequestException(`Only number fields convert units ('${entry.analyticalField}').`);
  if (!isAnalyticsUnit(unit.to)) throw new BadRequestException(`'${String(unit.to)}' is not a known unit (${Object.keys(ANALYTICS_UNITS).join(', ')}).`);
  if ((unit.from === undefined) === (unit.fromField === undefined)) {
    throw new BadRequestException(`The unit of '${entry.analyticalField}' needs either a fixed "from" unit or a "fromField".`);
  }
  if (unit.from !== undefined) {
    if (!isAnalyticsUnit(unit.from)) throw new BadRequestException(`'${String(unit.from)}' is not a known unit.`);
    if (ANALYTICS_UNITS[unit.from].dimension !== ANALYTICS_UNITS[unit.to].dimension) {
      throw new BadRequestException(`${unit.from} cannot convert to ${unit.to}: they measure different things.`);
    }
  }
  if (unit.fromField !== undefined && (typeof unit.fromField !== 'string' || !SOURCE_FIELD_PATH.test(unit.fromField))) {
    throw new BadRequestException(`Invalid unit fromField: '${String(unit.fromField)}'.`);
  }
}

/** Nested objects become dot paths (at most five levels); arrays and scalars are kept as they are. */
export function flattenRecord(record: Record<string, unknown>, prefix = '', depth = 0, into: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < 4) flattenRecord(value as Record<string, unknown>, path, depth + 1, into);
    else into[path] = value;
  }
  return into;
}

/** The value at a dot path; a plain name reads the top-level field. */
export function readSourceField(record: Record<string, unknown>, path: string): unknown {
  if (Object.hasOwn(record, path)) return record[path];
  let current: unknown = record;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
