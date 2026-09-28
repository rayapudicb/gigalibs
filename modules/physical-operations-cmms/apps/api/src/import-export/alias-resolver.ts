import { Injectable } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service.js';
import type { ImportableEntityType } from './types.js';

interface AliasRow {
  external_column: string;
  internal_column: string;
}

@Injectable()
export class AliasResolverService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Loads all column alias mappings for a tenant + entity type from the
   * column_alias_maps table and returns a Map<normalizedExternalName, registryKey>.
   */
  async loadAliasMap(tenantId: string, entityType: ImportableEntityType): Promise<Map<string, string>> {
    const { rows } = await this.db.queryWithTenant<AliasRow>(
      tenantId,
      `SELECT external_column, internal_column
         FROM gigalibs_cmms.column_alias_maps
        WHERE entity_type = $1
          AND NOT is_deleted`,
      [entityType],
    );

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(normalizeHeader(row.external_column), row.internal_column);
    }
    return map;
  }

  /**
   * Upserts a single alias mapping for a tenant.
   * Used by the column-mapping wizard when a user confirms "use X as Y".
   */
  async upsertAlias(
    tenantId: string,
    actorId: string,
    entityType: ImportableEntityType,
    externalColumn: string,
    internalColumn: string,
  ): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.column_alias_maps
         (tenant_id, entity_type, external_column, internal_column, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, entity_type, external_column)
       DO UPDATE SET internal_column = EXCLUDED.internal_column`,
      [tenantId, entityType, externalColumn, internalColumn, actorId],
    );
  }

  /**
   * Deletes a single alias mapping.
   */
  async deleteAlias(tenantId: string, entityType: ImportableEntityType, externalColumn: string): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `DELETE FROM gigalibs_cmms.column_alias_maps
        WHERE entity_type = $1 AND external_column = $2`,
      [entityType, externalColumn],
    );
  }
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}
