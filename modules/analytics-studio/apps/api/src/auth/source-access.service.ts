import {
  catalogModuleKeyForLegacySourceKey,
  generatedModuleAnalyticsSources,
  holdsPermission,
  type ModuleAnalyticsSourceContractV1,
} from '@gigalibs/contracts';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from './authorization.js';

export interface SourceConnectionAccessRow {
  readonly id: string;
  readonly displayName: string;
  readonly sourceType: string;
  readonly status: string;
  readonly catalogModuleKey: string | null;
  readonly moduleLifecycle: string | null;
  readonly ownerScopePolicy: string | null;
  readonly moduleSourceKey: string | null;
}

export interface ModuleSourceListItemV1 {
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly catalogModuleKey: string;
  readonly title: string;
  readonly moduleLifecycle: string | null;
  readonly requiredReadPermission: string;
  readonly ownerScopePolicy: string;
}

const BLOCKED_LIFECYCLES = new Set(['UNAVAILABLE', 'QUARANTINED']);

@Injectable()
export class SourceAccessService {
  private readonly logger = new Logger(SourceAccessService.name);
  private readonly contractsByCatalog = new Map(
    generatedModuleAnalyticsSources.map((contract) => [contract.catalogModuleKey, contract]),
  );

  constructor(private readonly db: DatabaseService) {}

  /** Resolves a source row under tenant RLS. */
  async loadSource(tenantId: string, sourceId: string): Promise<SourceConnectionAccessRow | null> {
    const result = await this.db.queryWithTenant<{
      id: string;
      display_name: string;
      source_type: string;
      status: string;
      catalog_module_key: string | null;
      module_lifecycle: string | null;
      owner_scope_policy: string | null;
      module_source_key: string | null;
    }>(
      tenantId,
      `SELECT id, display_name, source_type::text, status::text,
              catalog_module_key, module_lifecycle, owner_scope_policy, module_source_key
       FROM gigalibs_analytics.source_connections
       WHERE id = $1`,
      [sourceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      sourceType: row.source_type,
      status: row.status,
      catalogModuleKey: row.catalog_module_key,
      moduleLifecycle: row.module_lifecycle,
      ownerScopePolicy: row.owner_scope_policy,
      moduleSourceKey: row.module_source_key,
    };
  }

  /**
   * WI-OI-131 A5: tenant RLS, module entitlement replica, lifecycle, module read permission and scope policy.
   * Analytics entitlement is enforced by PlatformContextAuthorizationGuard before this runs.
   */
  async assertAnalyticsSourceAccess(principal: AnalyticsPrincipal, sourceId: string): Promise<SourceConnectionAccessRow> {
    const source = await this.loadSource(principal.tenantId, sourceId);
    if (!source) throw new NotFoundException(`Source '${sourceId}' not found.`);
    await this.enforceModuleSourceRules(principal, source);
    return source;
  }

  async assertForMapping(principal: AnalyticsPrincipal, mappingId: string): Promise<void> {
    const result = await this.db.queryWithTenant<{ connection_id: string }>(
      principal.tenantId,
      `SELECT connection_id FROM gigalibs_analytics.data_studio_mappings WHERE id = $1`,
      [mappingId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Mapping '${mappingId}' not found.`);
    await this.assertAnalyticsSourceAccess(principal, result.rows[0]!.connection_id);
  }

  async assertForDatasetVersion(principal: AnalyticsPrincipal, datasetVersionId: string): Promise<void> {
    const result = await this.db.queryWithTenant<{ connection_id: string }>(
      principal.tenantId,
      `SELECT m.connection_id
       FROM gigalibs_analytics.analytical_dataset_versions dv
       JOIN gigalibs_analytics.data_studio_mappings m ON m.id = dv.mapping_id
       WHERE dv.id = $1`,
      [datasetVersionId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Dataset version '${datasetVersionId}' not found.`);
    await this.assertAnalyticsSourceAccess(principal, result.rows[0]!.connection_id);
  }

  async assertForSemanticModel(principal: AnalyticsPrincipal, semanticModelId: string): Promise<void> {
    const result = await this.db.queryWithTenant<{ connection_id: string }>(
      principal.tenantId,
      `SELECT m.connection_id
       FROM gigalibs_analytics.semantic_models sm
       JOIN gigalibs_analytics.analytical_dataset_versions dv ON dv.id = sm.dataset_version_id
       JOIN gigalibs_analytics.data_studio_mappings m ON m.id = dv.mapping_id
       WHERE sm.id = $1`,
      [semanticModelId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Semantic model '${semanticModelId}' not found.`);
    await this.assertAnalyticsSourceAccess(principal, result.rows[0]!.connection_id);
  }

  async assertForDiscoveredSchema(principal: AnalyticsPrincipal, schemaId: string): Promise<void> {
    const result = await this.db.queryWithTenant<{ connection_id: string }>(
      principal.tenantId,
      `SELECT connection_id FROM gigalibs_analytics.discovered_source_schemas WHERE id = $1`,
      [schemaId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Schema '${schemaId}' not found.`);
    await this.assertAnalyticsSourceAccess(principal, result.rows[0]!.connection_id);
  }

  /** Module-owned sources the caller may use (registry ∩ entitled tenant sources). */
  async listModuleSources(principal: AnalyticsPrincipal): Promise<ModuleSourceListItemV1[]> {
    const result = await this.db.queryWithTenant<{
      id: string;
      catalog_module_key: string | null;
      module_source_key: string | null;
      module_lifecycle: string | null;
    }>(
      principal.tenantId,
      `SELECT id, catalog_module_key, module_source_key, module_lifecycle
       FROM gigalibs_analytics.source_connections
       WHERE source_type = 'MODULE_EVENTS'
         AND module_source_key IS NOT NULL
       ORDER BY display_name`,
    );
    const items: ModuleSourceListItemV1[] = [];
    for (const row of result.rows) {
      const catalogKey =
        row.catalog_module_key ??
        (row.module_source_key ? catalogModuleKeyForLegacySourceKey(row.module_source_key) : undefined);
      if (!catalogKey) continue;
      const contract = this.contractsByCatalog.get(catalogKey);
      if (!contract) continue;
      try {
        await this.enforceModuleSourceRules(principal, {
          id: row.id,
          displayName: contract.title,
          sourceType: 'MODULE_EVENTS',
          status: 'ACTIVE',
          catalogModuleKey: catalogKey,
          moduleLifecycle: row.module_lifecycle,
          ownerScopePolicy: contract.ownerScopePolicy,
          moduleSourceKey: row.module_source_key,
        });
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        throw error;
      }
      items.push({
        sourceId: row.id,
        sourceKey: contract.sourceKey,
        catalogModuleKey: catalogKey,
        title: contract.title,
        moduleLifecycle: row.module_lifecycle,
        requiredReadPermission: contract.requiredReadPermission,
        ownerScopePolicy: contract.ownerScopePolicy,
      });
    }
    return items;
  }

  /** Sources screen: only connections the principal may map or query. */
  async listAccessibleSources(
    principal: AnalyticsPrincipal,
  ): Promise<Array<{ id: string; displayName: string; sourceType: string; status: string }>> {
    const result = await this.db.queryWithTenant<{
      id: string;
      display_name: string;
      source_type: string;
      status: string;
      catalog_module_key: string | null;
      module_lifecycle: string | null;
      owner_scope_policy: string | null;
      module_source_key: string | null;
    }>(
      principal.tenantId,
      `SELECT id, display_name, source_type::text, status::text,
              catalog_module_key, module_lifecycle, owner_scope_policy, module_source_key
       FROM gigalibs_analytics.source_connections
       ORDER BY display_name`,
    );
    const accessible: Array<{ id: string; displayName: string; sourceType: string; status: string }> = [];
    for (const row of result.rows) {
      const source: SourceConnectionAccessRow = {
        id: row.id,
        displayName: row.display_name,
        sourceType: row.source_type,
        status: row.status,
        catalogModuleKey: row.catalog_module_key,
        moduleLifecycle: row.module_lifecycle,
        ownerScopePolicy: row.owner_scope_policy,
        moduleSourceKey: row.module_source_key,
      };
      try {
        await this.enforceModuleSourceRules(principal, source);
        accessible.push({
          id: source.id,
          displayName: source.displayName,
          sourceType: source.sourceType,
          status: source.status,
        });
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        throw error;
      }
    }
    return accessible;
  }

  private contractForSource(source: SourceConnectionAccessRow): ModuleAnalyticsSourceContractV1 | undefined {
    const catalogKey =
      source.catalogModuleKey ??
      (source.moduleSourceKey ? catalogModuleKeyForLegacySourceKey(source.moduleSourceKey) : undefined);
    return catalogKey ? this.contractsByCatalog.get(catalogKey) : undefined;
  }

  private async enforceModuleSourceRules(
    principal: AnalyticsPrincipal,
    source: SourceConnectionAccessRow,
  ): Promise<void> {
    if (source.moduleLifecycle && BLOCKED_LIFECYCLES.has(source.moduleLifecycle)) {
      throw new ForbiddenException('This analytics source is not available for this tenant.');
    }

    const contract = this.contractForSource(source);
    if (source.sourceType === 'MODULE_EVENTS' && contract) {
      const catalogKey = contract.catalogModuleKey;
      const entitlement = await this.db.queryWithTenant<{ status: string }>(
        principal.tenantId,
        `SELECT status FROM gigalibs_analytics.tenant_module_entitlement_replica
         WHERE tenant_id = $1 AND catalog_module_key = $2`,
        [principal.tenantId, catalogKey],
      );
      if (entitlement.rows.length === 0 || entitlement.rows[0]!.status !== 'ENABLED') {
        // WI-OI-150: plain words for people; the module key stays in the answer for administrators.
        throw new ForbiddenException({
          code: 'ANALYTICS_SOURCE_NOT_ENTITLED',
          message: 'This module is not in your workspace plan, so its data cannot be analysed here.',
          module: catalogKey,
        });
      }
      if (!holdsPermission(principal.permissions, contract.requiredReadPermission)) {
        // WI-OI-146 (QA-012): a workspace administrator holding the permission was refused on UAT; this records what the
        // request carried (counts only, no codes) so the cause can be seen in the log.
        this.logger.warn(
          `Module source refused: needs ${contract.requiredReadPermission}; the context carried ${principal.permissions.length} permissions, family wildcard ${holdsPermission(principal.permissions, `${contract.requiredReadPermission.split(/[:.]/)[0]}:*`) ? 'held' : 'not held'}.`,
        );
        throw new ForbiddenException({
          code: 'ANALYTICS_SOURCE_PERMISSION',
          message: "Your role does not include this module's data. Ask your workspace administrator for access.",
          permission: contract.requiredReadPermission,
        });
      }
      if (contract.ownerScopePolicy === 'UNIT_REQUIRED') {
        const scoped = principal.orgScope as { mode?: string; departments?: readonly string[] };
        if (scoped.mode === 'SCOPED_DEPARTMENTS' && (scoped.departments?.length ?? 0) === 0) {
          throw new ForbiddenException('Organization scope does not authorize any unit for this source.');
        }
      }
      return;
    }

    if (source.sourceType === 'MODULE_EVENTS' && source.moduleSourceKey) {
      throw new ForbiddenException('This module analytics source is not registered for entitlement access.');
    }

    if (source.status !== 'ACTIVE' && source.status !== 'PENDING') {
      throw new ForbiddenException('This external source connection is not active.');
    }
  }
}
