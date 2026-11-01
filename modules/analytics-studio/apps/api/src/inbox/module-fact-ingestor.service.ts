import { createHash } from 'node:crypto';
import {
  generatedModuleAnalyticsSources,
  inboxModuleSourceKeyForContract,
  parseModuleAnalyticsFactIngestV1,
  type ModuleAnalyticsFactIngestV1,
  type ModuleAnalyticsSourceContractV1,
  MODULE_ANALYTICS_FACT_V1,
} from '@gigalibs/contracts';
import type { RelayEnvelope } from '@gigalibs/module-sdk';
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ModuleMeasureCompilerService } from '../datasets/module-measure-compiler.service.js';

export type ModuleFactIngestStatus = 'stored' | 'duplicate' | 'rejected';

export interface ModuleFactIngestResult {
  status: ModuleFactIngestStatus;
  sourceConnectionId?: string;
  reasonCode?: string;
}

@Injectable()
export class ModuleFactIngestorService {
  private readonly contractsBySourceKey = new Map(
    generatedModuleAnalyticsSources.map((contract) => [contract.sourceKey, contract]),
  );

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly moduleCompiler?: ModuleMeasureCompilerService,
  ) {}

  async ingestFromRelayBody(producer: string | undefined, body: unknown): Promise<ModuleFactIngestResult> {
    const envelope = body as Partial<RelayEnvelope>;
    if (envelope?.eventType !== MODULE_ANALYTICS_FACT_V1) {
      throw new BadRequestException(`${String(producer)} may not deliver ${String(envelope?.eventType)} here.`);
    }
    const fact = parseModuleAnalyticsFactIngestV1(envelope.payload);
    return this.ingest(producer ?? 'module', envelope as RelayEnvelope, fact);
  }

  async ingest(
    producer: string,
    envelope: RelayEnvelope,
    fact: ModuleAnalyticsFactIngestV1,
  ): Promise<ModuleFactIngestResult> {
    const parsed = parseModuleAnalyticsFactIngestV1(fact);
    const contract = this.resolveContract(parsed);
    this.validateAgainstContract(contract, parsed);

    if (parsed.dataOrigin === 'TEST') {
      return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
        await client.query(
          `INSERT INTO gigalibs_analytics.module_fact_rejected
             (tenant_id, source_key, event_id, reason_code, envelope)
           VALUES ($1, $2, $3, 'TEST_ORIGIN', $4::jsonb)
           ON CONFLICT (tenant_id, source_key, event_id) DO NOTHING`,
          [envelope.tenantId, parsed.sourceKey, parsed.eventId, JSON.stringify({ envelope, fact: parsed })],
        );
        return { status: 'rejected' as const, reasonCode: 'TEST_ORIGIN' };
      });
    }

    return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
      const receipt = await client.query(
        `INSERT INTO gigalibs_analytics.inbox_receipts (message_id, tenant_id, source, event_type)
         VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING`,
        [envelope.messageId, envelope.tenantId, producer, envelope.eventType],
      );
      if ((receipt.rowCount ?? 0) === 0) return { status: 'duplicate' as const };

      const existing = await client.query(
        `SELECT 1 FROM gigalibs_analytics.module_fact_receipts
         WHERE tenant_id = $1 AND source_key = $2 AND event_id = $3`,
        [envelope.tenantId, parsed.sourceKey, parsed.eventId],
      );
      if ((existing.rowCount ?? 0) > 0) return { status: 'duplicate' as const };

      await this.assertModuleEntitled(client, envelope.tenantId, parsed.catalogModuleKey);

      const connectionId = await this.ensureModuleSource(client, envelope.tenantId, contract, parsed.sourceKey);

      const run = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.source_sync_runs
           (connection_id, tenant_id, status, rows_fetched, hub_sync_job_id, started_at, completed_at)
         VALUES ($1, $2, 'SUCCEEDED', 1, $3, $4, $4)
         ON CONFLICT (connection_id, hub_sync_job_id) WHERE hub_sync_job_id IS NOT NULL
         DO UPDATE SET completed_at = GREATEST(gigalibs_analytics.source_sync_runs.completed_at, EXCLUDED.completed_at)
         RETURNING id`,
        [connectionId, envelope.tenantId, envelope.messageId, envelope.occurredAt],
      );

      const pkField = contract.factSchema.primaryKeyField;
      const pkValue = parsed.fact[pkField];
      const sourcePkHash =
        typeof pkValue === 'string' || typeof pkValue === 'number'
          ? createHash('sha256').update(String(pkValue)).digest('hex')
          : createHash('sha256').update(parsed.eventId).digest('hex');

      const raw = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.raw_record_versions
           (sync_run_id, connection_id, tenant_id, source_table_name, source_pk_hash, raw_payload, ingested_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         RETURNING id`,
        [
          run.rows[0]!.id,
          connectionId,
          envelope.tenantId,
          `${parsed.sourceKey.replace(/-/g, '_')}_facts`,
          sourcePkHash,
          JSON.stringify({
            ...parsed.fact,
            _moduleFact: {
              sourceKey: parsed.sourceKey,
              catalogModuleKey: parsed.catalogModuleKey,
              eventId: parsed.eventId,
              factKind: parsed.factKind,
              reversalOfEventId: parsed.reversalOfEventId ?? null,
              aggregateVersion: parsed.aggregateVersion,
            },
          }),
          envelope.occurredAt,
        ],
      );

      await client.query(
        `INSERT INTO gigalibs_analytics.module_fact_receipts
           (tenant_id, source_key, event_id, connection_id, raw_record_version_id, fact_kind, data_origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          envelope.tenantId,
          parsed.sourceKey,
          parsed.eventId,
          connectionId,
          raw.rows[0]!.id,
          parsed.factKind,
          parsed.dataOrigin,
        ],
      );

      await client.query(
        `UPDATE gigalibs_analytics.source_connections
         SET module_lifecycle = 'ACTIVE', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND module_lifecycle IN ('NO_DATA', 'ACTIVE')`,
        [connectionId, envelope.tenantId],
      );

      if (this.moduleCompiler) {
        await this.moduleCompiler.ensureCompiledForConnection(envelope.tenantId, connectionId).catch(() => undefined);
      }

      return { status: 'stored' as const, sourceConnectionId: connectionId };
    });
  }

  private resolveContract(fact: ModuleAnalyticsFactIngestV1): ModuleAnalyticsSourceContractV1 {
    const contract = this.contractsBySourceKey.get(fact.sourceKey);
    if (!contract || contract.catalogModuleKey !== fact.catalogModuleKey) {
      throw new BadRequestException(`Unknown or mismatched module analytics source ${fact.sourceKey}.`);
    }
    if (fact.factSchemaVersion !== contract.factSchema.schemaVersion) {
      throw new BadRequestException(`Unsupported fact schema version for ${fact.sourceKey}.`);
    }
    return contract;
  }

  private validateAgainstContract(contract: ModuleAnalyticsSourceContractV1, fact: ModuleAnalyticsFactIngestV1): void {
    const unitField = contract.factSchema.ownerUnitIdField;
    if (contract.ownerScopePolicy === 'UNIT_REQUIRED') {
      const fromFact = unitField ? fact.fact[unitField] : undefined;
      const unit = fact.ownerUnitId ?? (typeof fromFact === 'string' ? fromFact : null);
      if (!unit) {
        throw new BadRequestException(`Owner unit is required for source ${fact.sourceKey}.`);
      }
    }
    if (contract.ownerScopePolicy === 'TENANT_SHARED_EXPLICIT') {
      const fromFact = unitField ? fact.fact[unitField] : undefined;
      const unit = fact.ownerUnitId ?? fromFact;
      if (unit === undefined) {
        throw new BadRequestException(`Owner scope must be explicit for source ${fact.sourceKey}.`);
      }
    }
  }

  private async assertModuleEntitled(
    client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount?: number; rows: unknown[] }> },
    tenantId: string,
    catalogModuleKey: string,
  ): Promise<void> {
    const entitlement = await client.query(
      `SELECT status FROM gigalibs_analytics.tenant_module_entitlement_replica
       WHERE tenant_id = $1 AND catalog_module_key = $2`,
      [tenantId, catalogModuleKey],
    );
    const entitlementRow = entitlement.rows[0] as { status: string } | undefined;
    if (!entitlementRow || entitlementRow.status !== 'ENABLED') {
      throw new ForbiddenException(`Module entitlement '${catalogModuleKey}' is not active for this tenant.`);
    }
  }

  private async ensureModuleSource(
    client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }> },
    tenantId: string,
    contract: ModuleAnalyticsSourceContractV1,
    sourceKey: string,
  ): Promise<string> {
    const moduleSourceKey = inboxModuleSourceKeyForContract(sourceKey);
    const source = await client.query(
      `INSERT INTO gigalibs_analytics.source_connections
         (tenant_id, display_name, source_type, status, created_by, module_source_key,
          catalog_module_key, contract_version, owner_scope_policy, module_lifecycle)
       VALUES ($1, $2, 'MODULE_EVENTS', 'ACTIVE', 'module-fact-ingestor', $3, $4, $5, $6, 'NO_DATA')
       ON CONFLICT (tenant_id, module_source_key) WHERE module_source_key IS NOT NULL
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         catalog_module_key = EXCLUDED.catalog_module_key,
         contract_version = EXCLUDED.contract_version,
         owner_scope_policy = EXCLUDED.owner_scope_policy
       RETURNING id`,
      [
        tenantId,
        contract.title,
        moduleSourceKey,
        contract.catalogModuleKey,
        contract.contractVersion,
        contract.ownerScopePolicy,
      ],
    );
    return source.rows[0]!.id;
  }
}
