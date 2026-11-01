import {
  generatedModuleAnalyticsSources,
  inboxModuleSourceKeyForContract,
  parseTenantModuleEntitlementsSnapshotV2,
  TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  type TenantModuleEntitlementsSnapshotV2,
} from '@gigalibs/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { RelayEnvelope } from '@gigalibs/module-sdk';
import { DatabaseService } from '../database/database.service.js';

const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;

@Injectable()
export class EntitlementSnapshotInboxService {
  constructor(private readonly db: DatabaseService) {}

  parseEnvelope(body: unknown): { envelope: RelayEnvelope; snapshot: TenantModuleEntitlementsSnapshotV2 } {
    const envelope = body as Partial<RelayEnvelope>;
    if (
      !envelope ||
      envelope.eventType !== TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2 ||
      envelope.schemaVersion !== 1 ||
      !text(envelope.messageId, 64) ||
      !text(envelope.tenantId, 64) ||
      !text(envelope.aggregateId, 64) ||
      !Number.isSafeInteger(envelope.aggregateVersion) ||
      Number.isNaN(Date.parse(String(envelope.occurredAt)))
    ) {
      throw new BadRequestException('The entitlement snapshot message is incomplete.');
    }
    const snapshot = parseTenantModuleEntitlementsSnapshotV2(envelope.payload);
    if (snapshot.tenantId !== envelope.tenantId || snapshot.snapshotVersion !== envelope.aggregateVersion) {
      throw new BadRequestException('The entitlement snapshot does not match its envelope.');
    }
    return { envelope: envelope as RelayEnvelope, snapshot };
  }

  async receive(body: unknown): Promise<{ status: 'applied' | 'duplicate' | 'stale' }> {
    const { envelope, snapshot } = this.parseEnvelope(body);
    return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
      const receipt = await client.query(
        `INSERT INTO gigalibs_analytics.inbox_receipts (message_id, tenant_id, source, event_type)
         VALUES ($1, $2, 'control-plane', $3) ON CONFLICT (message_id) DO NOTHING`,
        [envelope.messageId, envelope.tenantId, envelope.eventType],
      );
      if ((receipt.rowCount ?? 0) === 0) return { status: 'duplicate' as const };

      const lag = await client.query<{ max_version: string | null }>(
        `SELECT MAX(snapshot_version)::text AS max_version
         FROM gigalibs_analytics.tenant_module_entitlement_replica
         WHERE tenant_id = $1`,
        [envelope.tenantId],
      );
      const appliedMax = Number(lag.rows[0]?.max_version ?? 0);
      if (snapshot.snapshotVersion <= appliedMax) return { status: 'stale' as const };

      for (const row of snapshot.modules) {
        await client.query(
          `INSERT INTO gigalibs_analytics.tenant_module_entitlement_replica
             (tenant_id, catalog_module_key, snapshot_version, status, applied_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, catalog_module_key) DO UPDATE
           SET snapshot_version = EXCLUDED.snapshot_version,
               status = EXCLUDED.status,
               applied_at = EXCLUDED.applied_at`,
          [
            envelope.tenantId,
            row.catalogModuleKey,
            snapshot.snapshotVersion,
            row.status,
            envelope.occurredAt,
          ],
        );
      }

      const enabled = new Set(snapshot.enabledModuleKeys);
      for (const contract of generatedModuleAnalyticsSources) {
        const moduleSourceKey = inboxModuleSourceKeyForContract(contract.sourceKey);
        if (enabled.has(contract.catalogModuleKey)) {
          await client.query(
            `INSERT INTO gigalibs_analytics.source_connections
               (tenant_id, display_name, source_type, status, created_by, module_source_key,
                catalog_module_key, contract_version, owner_scope_policy, module_lifecycle)
             VALUES ($1, $2, 'MODULE_EVENTS', 'ACTIVE', 'control-plane', $3, $4, $5, $6, $7)
             ON CONFLICT (tenant_id, module_source_key) WHERE module_source_key IS NOT NULL
             DO UPDATE SET
               display_name = EXCLUDED.display_name,
               catalog_module_key = EXCLUDED.catalog_module_key,
               contract_version = EXCLUDED.contract_version,
               owner_scope_policy = EXCLUDED.owner_scope_policy,
               module_lifecycle = CASE
                 WHEN gigalibs_analytics.source_connections.module_lifecycle = 'ACTIVE' THEN 'ACTIVE'
                 WHEN EXISTS (
                   SELECT 1 FROM gigalibs_analytics.raw_record_versions r
                   WHERE r.connection_id = gigalibs_analytics.source_connections.id
                     AND r.tenant_id = EXCLUDED.tenant_id
                 ) THEN 'ACTIVE'
                 ELSE 'NO_DATA'
               END,
               updated_at = now()`,
            [
              envelope.tenantId,
              contract.title,
              moduleSourceKey,
              contract.catalogModuleKey,
              contract.contractVersion,
              contract.ownerScopePolicy,
              'NO_DATA',
            ],
          );
        } else {
          await client.query(
            `UPDATE gigalibs_analytics.source_connections
             SET module_lifecycle = 'UNAVAILABLE', updated_at = now()
             WHERE tenant_id = $1
               AND catalog_module_key = $2
               AND source_type = 'MODULE_EVENTS'`,
            [envelope.tenantId, contract.catalogModuleKey],
          );
        }
      }

      return { status: 'applied' as const };
    });
  }
}
