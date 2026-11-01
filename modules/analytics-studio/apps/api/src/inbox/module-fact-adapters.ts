import type { RelayEnvelope } from '@gigalibs/module-sdk';
import type { ModuleAnalyticsFactIngestV1, WorkforcePositionFactV1 } from '@gigalibs/contracts';
import { UNMATCHED_UNIT } from '../organization/organization-scope.js';
import { projectDowntimeFact } from '../workers/downtime-fact-ingestion.worker.js';

function downtimeMinutes(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

/** Maps legacy CMMS downtime relay envelopes to the registry contract (cmms-downtime). */
export function cmmsDowntimeToModuleFactIngest(
  envelope: RelayEnvelope,
  payload: Record<string, unknown>,
): ModuleAnalyticsFactIngestV1 {
  const projected = projectDowntimeFact({
    assetId: String(payload.assetId),
    downtimeId: String(payload.downtimeId),
    startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : undefined,
    endedAt: typeof payload.endedAt === 'string' ? payload.endedAt : undefined,
  });
  const startedAt = typeof payload.startedAt === 'string' ? payload.startedAt : undefined;
  const endedAt = typeof payload.endedAt === 'string' ? payload.endedAt : undefined;
  const minutes = downtimeMinutes(startedAt, endedAt);
  return {
    catalogModuleKey: 'asset-maintenance',
    sourceKey: 'cmms-downtime',
    eventId: envelope.messageId,
    aggregateId: envelope.aggregateId,
    aggregateVersion: envelope.aggregateVersion,
    occurredAt: envelope.occurredAt,
    factSchemaVersion: 1,
    factKind: 'UPSERT',
    dataOrigin: 'PRODUCTION',
    ownerUnitId: typeof payload.owningUnitId === 'string' ? payload.owningUnitId : UNMATCHED_UNIT,
    fact: {
      event_id: envelope.messageId,
      occurred_at: envelope.occurredAt,
      owning_unit_id: typeof payload.owningUnitId === 'string' ? payload.owningUnitId : UNMATCHED_UNIT,
      duration_minutes: minutes ?? 0,
      failure_code: typeof payload.failureCauseCode === 'string' ? payload.failureCauseCode : 'UNSPECIFIED',
      asset_id: projected.asset_id,
      downtime_id: projected.downtime_id,
      event_type: envelope.eventType,
    },
  };
}

/** Maps Workforce position snapshots to workforce-positions contract facts. */
export function workforcePositionToModuleFactIngest(
  envelope: RelayEnvelope,
  fact: WorkforcePositionFactV1,
): ModuleAnalyticsFactIngestV1 {
  return {
    catalogModuleKey: 'gigaops',
    sourceKey: 'workforce-positions',
    eventId: envelope.messageId,
    aggregateId: envelope.aggregateId,
    aggregateVersion: envelope.aggregateVersion,
    occurredAt: envelope.occurredAt,
    factSchemaVersion: 1,
    factKind: 'UPSERT',
    dataOrigin: 'PRODUCTION',
    ownerUnitId: fact.organizationUnitId,
    fact: {
      entity_id: fact.entityId,
      effective_from: fact.effectiveFrom,
      organization_unit_id: fact.organizationUnitId,
      status: fact.status,
      code: fact.code,
      fte: fact.fte,
      tenant_shared: fact.tenantShared,
      event_type: envelope.eventType,
    },
  };
}
