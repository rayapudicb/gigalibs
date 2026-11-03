import {
  generatedModuleAnalyticsSources,
  inboxModuleSourceKeyForContract,
  type ModuleAnalyticsCompiledSourceCatalogV1,
  type ModuleAnalyticsSourceContractV1,
} from '@gigalibs/contracts';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { compileModuleSourceContract } from './compile-module-source-contract.js';
import { DatasetService } from './dataset.service.js';

const PIPELINE_SUBJECT = 'module-measure-compiler';

@Injectable()
export class ModuleMeasureCompilerService {
  private readonly logger = new Logger(ModuleMeasureCompilerService.name);
  private readonly contractsBySourceKey = new Map(
    generatedModuleAnalyticsSources.map((contract) => [contract.sourceKey, contract]),
  );

  constructor(
    private readonly db: DatabaseService,
    private readonly datasets: DatasetService,
  ) {}

  resolveContract(source: {
    catalogModuleKey: string | null;
    moduleSourceKey: string | null;
  }): ModuleAnalyticsSourceContractV1 | undefined {
    for (const contract of generatedModuleAnalyticsSources) {
      const legacyKey = inboxModuleSourceKeyForContract(contract.sourceKey);
      if (contract.catalogModuleKey === source.catalogModuleKey || source.moduleSourceKey === legacyKey) {
        return contract;
      }
    }
    return source.catalogModuleKey
      ? this.contractsBySourceKey.get(
          generatedModuleAnalyticsSources.find((entry) => entry.catalogModuleKey === source.catalogModuleKey)?.sourceKey ?? '',
        )
      : undefined;
  }

  async ensureCompiledForConnection(tenantId: string, connectionId: string): Promise<void> {
    const source = await this.db.queryWithTenant<{
      id: string;
      catalog_module_key: string | null;
      module_source_key: string | null;
      module_lifecycle: string | null;
    }>(
      tenantId,
      `SELECT id, catalog_module_key, module_source_key, module_lifecycle
       FROM gigalibs_analytics.source_connections
       WHERE id = $1 AND source_type = 'MODULE_EVENTS'`,
      [connectionId],
    );
    const row = source.rows[0];
    if (!row) return;
    const contract = this.resolveContract({
      catalogModuleKey: row.catalog_module_key,
      moduleSourceKey: row.module_source_key,
    });
    if (!contract) return;
    await this.compileInternal(tenantId, row.id, contract, row.module_lifecycle);
  }

  async getCatalog(principal: AnalyticsPrincipal, sourceId: string): Promise<ModuleAnalyticsCompiledSourceCatalogV1> {
    const source = await this.db.queryWithTenant<{
      id: string;
      catalog_module_key: string | null;
      module_source_key: string | null;
      module_lifecycle: string | null;
    }>(
      principal.tenantId,
      `SELECT id, catalog_module_key, module_source_key, module_lifecycle
       FROM gigalibs_analytics.source_connections WHERE id = $1`,
      [sourceId],
    );
    const row = source.rows[0];
    if (!row) throw new NotFoundException(`Source '${sourceId}' was not found.`);
    const contract = this.resolveContract({
      catalogModuleKey: row.catalog_module_key,
      moduleSourceKey: row.module_source_key,
    });
    if (!contract) throw new NotFoundException('This connection is not a registered module analytics source.');

    const binding = await this.compileInternal(principal.tenantId, row.id, contract, row.module_lifecycle);
    const reconciliation = await this.db.queryWithTenant<{ status: string }>(
      principal.tenantId,
      `SELECT status FROM gigalibs_analytics.module_source_reconciliation
       WHERE tenant_id = $1 AND source_key = $2`,
      [principal.tenantId, contract.sourceKey],
    );

    return {
      sourceId: row.id,
      sourceKey: contract.sourceKey,
      title: contract.title,
      catalogModuleKey: contract.catalogModuleKey,
      contractVersion: contract.contractVersion,
      semanticModelId: binding.semanticModelId,
      mappingId: binding.mappingId,
      moduleLifecycle: row.module_lifecycle,
      measures: contract.measures,
      dimensions: contract.dimensions,
      defaultViews: contract.defaultViews,
      freshnessTargetSeconds: contract.freshnessTargetSeconds,
      eventTimeField: contract.factSchema.eventTimeField,
      primaryKeyField: contract.factSchema.primaryKeyField,
      reconciliationStatus: (reconciliation.rows[0]?.status as ModuleAnalyticsCompiledSourceCatalogV1['reconciliationStatus']) ?? null,
    };
  }

  private async compileInternal(
    tenantId: string,
    connectionId: string,
    contract: ModuleAnalyticsSourceContractV1,
    moduleLifecycle: string | null,
  ): Promise<{ mappingId: string; semanticModelId: string }> {
    const compiled = compileModuleSourceContract(contract);
    const existing = await this.db.queryWithTenant<{
      id: string;
      contract_version: number | null;
      dataset_version_id: string;
    }>(
      tenantId,
      `SELECT id, contract_version, dataset_version_id
       FROM gigalibs_analytics.semantic_models
       WHERE tenant_id = $1 AND module_source_key = $2`,
      [tenantId, contract.sourceKey],
    );

    if (existing.rows[0]) {
      const mappingId = await this.mappingIdForDataset(tenantId, existing.rows[0].dataset_version_id);
      const mappingVersion = await this.publishMappingIfNeeded(tenantId, mappingId, compiled);
      await this.datasets.syncModuleSemanticModel({
        tenantId,
        modelId: existing.rows[0].id,
        contract,
        compiled,
      });
      await this.datasets.buildModuleDataset(tenantId, mappingId, mappingVersion, contract.requiredReadPermission);
      await this.datasets.pointModelAtLatestDataset(tenantId, existing.rows[0].id, mappingId);
      return { mappingId, semanticModelId: existing.rows[0].id };
    }

    const mappingId = await this.createPublishedMapping(tenantId, connectionId, contract, compiled);
    await this.datasets.buildModuleDataset(tenantId, mappingId, 1, contract.requiredReadPermission);
    const datasetId = await this.datasets.latestDatasetVersionId(tenantId, mappingId);
    if (!datasetId) throw new Error('Module dataset build did not produce a version.');
    const model = await this.datasets.createModuleSemanticModel({
      tenantId,
      subject: PIPELINE_SUBJECT,
      datasetVersionId: datasetId,
      contract,
      compiled,
      moduleLifecycle,
    });

    this.logger.log(
      `[tenant:${tenantId}] Compiled module source ${contract.sourceKey} → model ${model.id} (contract v${contract.contractVersion}).`,
    );
    return { mappingId, semanticModelId: model.id };
  }

  private async createPublishedMapping(
    tenantId: string,
    connectionId: string,
    contract: ModuleAnalyticsSourceContractV1,
    compiled: ReturnType<typeof compileModuleSourceContract>,
  ): Promise<string> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const mappingInsert = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.data_studio_mappings
           (connection_id, tenant_id, display_name, source_table_name, lifecycle, created_by)
         VALUES ($1, $2, $3, $4, 'PUBLISHED', $5)
         RETURNING id`,
        [connectionId, tenantId, `${contract.title} (contract v${contract.contractVersion})`, compiled.sourceTableName, PIPELINE_SUBJECT],
      );
      const mappingId = mappingInsert.rows[0]!.id;
      await this.insertMappingVersion(client, tenantId, mappingId, 1, compiled);
      return mappingId;
    });
  }

  private async publishMappingIfNeeded(
    tenantId: string,
    mappingId: string,
    compiled: ReturnType<typeof compileModuleSourceContract>,
  ): Promise<number> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const latest = await client.query<{ version_number: number; content_hash: string }>(
        `SELECT version_number, content_hash FROM gigalibs_analytics.studio_mapping_versions
         WHERE mapping_id = $1 ORDER BY version_number DESC LIMIT 1`,
        [mappingId],
      );
      const canonicalJson = JSON.stringify(
        [...compiled.fieldMappings].sort((left, right) => left.analyticalField.localeCompare(right.analyticalField)),
      );
      const contentHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
      if (latest.rows[0]?.content_hash === contentHash) return latest.rows[0].version_number;
      const nextVersion = (latest.rows[0]?.version_number ?? 0) + 1;
      await this.insertMappingVersion(client, tenantId, mappingId, nextVersion, compiled);
      return nextVersion;
    });
  }

  private async insertMappingVersion(
    client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
    tenantId: string,
    mappingId: string,
    versionNumber: number,
    compiled: ReturnType<typeof compileModuleSourceContract>,
  ): Promise<void> {
    const canonicalJson = JSON.stringify(
      [...compiled.fieldMappings].sort((left, right) => left.analyticalField.localeCompare(right.analyticalField)),
    );
    const contentHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
    await client.query(
      `INSERT INTO gigalibs_analytics.studio_mapping_versions
         (mapping_id, tenant_id, version_number, field_mappings, content_hash, published_by, module_compile_manifest)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        mappingId,
        tenantId,
        versionNumber,
        JSON.stringify(compiled.fieldMappings),
        contentHash,
        PIPELINE_SUBJECT,
        JSON.stringify(compiled.manifest),
      ],
    );
  }

  private async mappingIdForDataset(tenantId: string, datasetVersionId: string): Promise<string> {
    const result = await this.db.queryWithTenant<{ mapping_id: string }>(
      tenantId,
      `SELECT mapping_id FROM gigalibs_analytics.analytical_dataset_versions WHERE id = $1`,
      [datasetVersionId],
    );
    return result.rows[0]?.mapping_id ?? '';
  }
}
