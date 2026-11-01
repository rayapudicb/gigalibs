import { signRelayToken } from '@gigalibs/auth-core';
import {
  RelayEnvelopeV1Schema,
  TENANT_ENTITLEMENTS_CHANGED_V2,
  TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  TenantModuleEntitlementsSnapshotV2Schema,
} from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';

export const ANALYTICS_ENTITLEMENT_RELAY_AUDIENCE = 'gigalibs-analytics-inbox';

interface ClaimedEntitlementEvent {
  readonly id: string;
  readonly eventId: string;
  readonly tenantId: string;
  readonly aggregateId: string;
  readonly eventType: string;
}

/**
 * Relays ordered entitlement snapshots to Analytics (WI-OI-131 A4). The control outbox worker owns retry and
 * acknowledgement; this service never marks an event published.
 */
@Injectable()
export class AnalyticsEntitlementRelayService {
  async deliver(claimed: ClaimedEntitlementEvent): Promise<void> {
    if (claimed.eventType !== TENANT_ENTITLEMENTS_CHANGED_V2) throw new Error('ENTITLEMENT_EVENT_UNSUPPORTED');

    const env = { ...process.env };
    env.ANALYTICS_INBOX_PATH ||= '/internal/v1/inbox';
    const config = loadRelayConfig(env, {
      inboxPublicKey: 'ANALYTICS_CONTROL_PLANE_INBOX_RELAY_PUBLIC_KEY_BASE64',
      targetUrl: 'ANALYTICS_ENTITLEMENT_RELAY_URL',
      signingKey: 'ANALYTICS_CONTROL_PLANE_INBOX_RELAY_PRIVATE_KEY_BASE64',
      interval: 'ANALYTICS_ENTITLEMENT_RELAY_INTERVAL_MS',
      peerService: 'analytics-api',
      inboxPath: 'ANALYTICS_INBOX_PATH',
    });
    if (!config.outbound) throw new Error('ANALYTICS_ENTITLEMENT_RELAY_NOT_CONFIGURED');

    const event = await prisma.controlOutboxEvent.findUnique({
      where: { id: claimed.id },
      select: {
        eventId: true,
        tenantId: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        payload: true,
        createdAt: true,
      },
    });
    if (
      !event ||
      event.eventId !== claimed.eventId ||
      event.tenantId !== claimed.tenantId ||
      event.aggregateId !== claimed.aggregateId ||
      event.eventType !== claimed.eventType ||
      event.aggregateType !== 'tenant-module-entitlements'
    ) {
      throw new Error('ENTITLEMENT_OUTBOX_CLAIM_INVALID');
    }

    const snapshot = TenantModuleEntitlementsSnapshotV2Schema.parse(event.payload);
    const envelope = RelayEnvelopeV1Schema.parse({
      messageId: event.eventId,
      tenantId: event.tenantId,
      eventType: TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
      aggregateType: 'tenant-module-entitlements',
      aggregateId: event.aggregateId,
      aggregateVersion: snapshot.snapshotVersion,
      correlationId: event.eventId,
      causationId: null,
      schemaVersion: 1,
      payload: snapshot,
      occurredAt: event.createdAt.toISOString(),
    });
    const body = JSON.stringify(envelope);
    const token = signRelayToken(
      {
        audience: ANALYTICS_ENTITLEMENT_RELAY_AUDIENCE,
        source: 'control-plane',
        tenantId: event.tenantId,
        messageId: event.eventId,
        body,
      },
      config.outbound.privateKey,
    );
    const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(
        response.status >= 500 || response.status === 408 || response.status === 429
          ? 'ANALYTICS_ENTITLEMENT_RELAY_UNAVAILABLE'
          : 'ANALYTICS_ENTITLEMENT_RELAY_REJECTED',
      );
    }
    const outcome: unknown = await response.json();
    if (
      !outcome ||
      typeof outcome !== 'object' ||
      !('status' in outcome) ||
      !['applied', 'duplicate', 'stale'].includes(String(outcome.status))
    ) {
      throw new Error('ANALYTICS_ENTITLEMENT_RELAY_ACK_INVALID');
    }
  }
}
