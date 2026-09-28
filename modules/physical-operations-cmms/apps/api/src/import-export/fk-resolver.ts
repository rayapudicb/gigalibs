import { Injectable } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service.js';
import type { ImportableEntityType, FkMap, FkResolutionResult, EntityColumnDef } from './types.js';
import { getFkColumnDefs } from './column-registry.js';

/**
 * Resolves foreign-key columns by pre-building in-memory Maps before the row loop.
 * Pattern: SELECT id, <matchColumn> FROM <table> WHERE tenant_id = $1 AND NOT is_deleted
 * Then: Map<lowerCasedMatchValue, uuid>
 *
 * This avoids per-row DB lookups (critical for performance on large imports).
 */
@Injectable()
export class FkResolverService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Builds FK resolution maps for all FK/hierarchy columns of an entity type.
   * Returns Record<registryKey, Map<nameValue, uuid>>.
   */
  async buildFkMaps(tenantId: string, entityType: ImportableEntityType): Promise<FkResolutionResult> {
    const fkDefs = getFkColumnDefs(entityType);
    const result: FkResolutionResult = {};

    await Promise.all(
      fkDefs.map(async (def) => {
        const map = await this.resolveOneTable(tenantId, def);
        result[def.key] = map;
      }),
    );

    return result;
  }

  private async resolveOneTable(tenantId: string, def: EntityColumnDef): Promise<FkMap> {
    const fk = def.fkResolution;
    if (!fk) return new Map();

    const matchCol = fk.matchColumn;
    const table = fk.table;

    // Build query — all CMMS entity tables share tenant_id + is_deleted pattern
    const { rows } = await this.db.queryWithTenant<{ id: string; match_value: string }>(
      tenantId,
      `SELECT id, ${matchCol} AS match_value
         FROM gigalibs_cmms.${table}
        WHERE NOT is_deleted`,
      [],
    );

    const map: FkMap = new Map();
    for (const row of rows) {
      if (row.match_value != null) {
        map.set(row.match_value.toLowerCase(), row.id);
      }
    }
    return map;
  }

  /**
   * Resolves a single FK value using a pre-built map.
   * Returns the UUID string, or null if not found (nullable FK) or throws if required.
   */
  resolveValue(
    map: FkMap,
    rawValue: unknown,
    def: EntityColumnDef,
  ): string | null {
    if (rawValue == null || rawValue === '') {
      if (def.fkResolution?.nullable) return null;
      throw new Error(`Required FK column "${def.key}" is empty`);
    }
    const key = String(rawValue).toLowerCase();
    const resolved = map.get(key);
    if (resolved === undefined) {
      if (def.fkResolution?.nullable) return null;
      throw new Error(`No matching ${def.fkResolution?.table ?? 'entity'} found for "${rawValue}" in column "${def.key}"`);
    }
    return resolved;
  }
}
