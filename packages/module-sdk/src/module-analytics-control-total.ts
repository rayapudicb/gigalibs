import { randomUUID } from 'node:crypto';
import {
  MODULE_ANALYTICS_CONTROL_TOTAL_V1,
  type ModuleAnalyticsControlTotalV1,
} from '@gigalibs/contracts';
import type { RelayConfig } from './relay-config.js';
import { deliver, type RelayEnvelope } from './outbox-relay.js';

export interface PublishModuleAnalyticsControlTotalInput {
  readonly tenantId: string;
  readonly source: string;
  readonly audience: string;
  readonly controlTotal: ModuleAnalyticsControlTotalV1;
}

/** Signs and POSTs a MODULE_ANALYTICS_CONTROL_TOTAL_V1 message to the Analytics inbox. */
export async function publishModuleAnalyticsControlTotal(
  config: RelayConfig,
  input: PublishModuleAnalyticsControlTotalInput,
): Promise<{ readonly ok: boolean; readonly code: string | null }> {
  const outbound = config.outbound;
  if (!outbound) return { ok: false, code: 'RELAY_NOT_CONFIGURED' };
  const messageId = randomUUID();
  const envelope: RelayEnvelope = {
    messageId,
    tenantId: input.tenantId,
    eventType: MODULE_ANALYTICS_CONTROL_TOTAL_V1,
    aggregateType: 'module-analytics-control-total',
    aggregateId: `${input.controlTotal.sourceKey}:${input.tenantId}`,
    aggregateVersion: input.controlTotal.backfillBatchSeq ?? 1,
    correlationId: messageId,
    causationId: null,
    schemaVersion: 1,
    payload: input.controlTotal as unknown as Record<string, unknown>,
    occurredAt: input.controlTotal.reportedAt,
  };
  const outcome = await deliver(
    outbound.targetOrigin,
    outbound.privateKey,
    input.audience,
    input.source,
    envelope,
    outbound.inboxPath,
  );
  return { ok: outcome.ok, code: outcome.code };
}
