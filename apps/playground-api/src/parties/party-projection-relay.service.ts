import { signRelayToken } from '@gigalibs/auth-core';
import {
  PartyArchivedEventV1Schema,
  PartyCreatedEventV1Schema,
  PartyMergedEventV1Schema,
  PartyRoleChangedEventV1Schema,
  PartyUpdatedEventV1Schema,
  RelayEnvelopeV1Schema,
} from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';

export const PARTY_PROJECTION_EVENT_TYPES = [
  'party.created.v1', 'party.updated.v1', 'party.archived.v1', 'party.merged.v1', 'party.role.changed.v1',
] as const;

interface ClaimedPartyEvent {
  readonly id: string;
  readonly eventId: string;
  readonly tenantId: string;
  readonly aggregateId: string;
  readonly eventType: string;
}

/**
 * Sends kernel Party facts over the private, signed HTTP relay. The control outbox worker retains
 * ownership of retry, dead letter and acknowledgement; this service never marks an event sent.
 */
@Injectable()
export class PartyProjectionRelayService {
  async deliver(claimed: ClaimedPartyEvent): Promise<void> {
    if (!(PARTY_PROJECTION_EVENT_TYPES as readonly string[]).includes(claimed.eventType)) {
      throw new Error('PARTY_EVENT_UNSUPPORTED');
    }
    const env = { ...process.env };
    env.BUSINESS_PARTNERS_INBOX_PATH ||= '/business-partners/internal/v1/party-inbox';
    const config = loadRelayConfig(env, {
      inboxPublicKey: 'BUSINESS_PARTNERS_UNUSED_INBOX_PUBLIC_KEY',
      targetUrl: 'BUSINESS_PARTNERS_RELAY_URL',
      signingKey: 'BUSINESS_PARTNERS_INBOX_RELAY_PRIVATE_KEY_BASE64',
      interval: 'BUSINESS_PARTNERS_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'BUSINESS_PARTNERS_INBOX_PATH',
    });
    if (!config.outbound) throw new Error('PARTY_RELAY_NOT_CONFIGURED');

    const event = await prisma.controlOutboxEvent.findUnique({
      where: { id: claimed.id },
      select: { eventId: true, tenantId: true, aggregateType: true, aggregateId: true, eventType: true, payload: true, createdAt: true },
    });
    if (!event || event.eventId !== claimed.eventId || event.tenantId !== claimed.tenantId ||
        event.aggregateId !== claimed.aggregateId || event.eventType !== claimed.eventType || event.aggregateType !== 'party') {
      throw new Error('PARTY_OUTBOX_CLAIM_INVALID');
    }
    const aggregateVersion = payloadVersion(event.eventType, event.payload);
    const envelope = RelayEnvelopeV1Schema.parse({
      messageId: event.eventId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      aggregateType: 'party',
      aggregateId: event.aggregateId,
      aggregateVersion,
      correlationId: event.eventId,
      causationId: null,
      schemaVersion: 1,
      payload: event.payload,
      occurredAt: event.createdAt.toISOString(),
    });
    const body = JSON.stringify(envelope);
    const token = signRelayToken({
      audience: 'gigalibs-business-partners-inbox',
      source: 'kernel',
      tenantId: event.tenantId,
      messageId: event.eventId,
      body,
    }, config.outbound.privateKey);
    const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(response.status >= 500 || response.status === 408 || response.status === 429
      ? 'PARTY_RELAY_UNAVAILABLE' : 'PARTY_RELAY_REJECTED');
    const outcome: unknown = await response.json();
    if (!outcome || typeof outcome !== 'object' || !('status' in outcome) ||
        !['PROCESSED', 'DUPLICATE'].includes(String(outcome.status))) {
      throw new Error('PARTY_RELAY_ACK_INVALID');
    }
  }
}

function payloadVersion(eventType: string, payload: unknown): number {
  switch (eventType) {
    case 'party.created.v1': {
      const parsed = PartyCreatedEventV1Schema.shape.data.safeParse(payload);
      if (parsed.success) return parsed.data.version;
      break;
    }
    case 'party.updated.v1': {
      const parsed = PartyUpdatedEventV1Schema.shape.data.safeParse(payload);
      if (parsed.success) return parsed.data.version;
      break;
    }
    case 'party.archived.v1': {
      const parsed = PartyArchivedEventV1Schema.shape.data.safeParse(payload);
      if (parsed.success && parsed.data.version) return parsed.data.version;
      break;
    }
    case 'party.merged.v1': {
      const parsed = PartyMergedEventV1Schema.shape.data.safeParse(payload);
      if (parsed.success && parsed.data.targetVersion) return parsed.data.targetVersion;
      break;
    }
    case 'party.role.changed.v1': {
      const parsed = PartyRoleChangedEventV1Schema.shape.data.safeParse(payload);
      if (parsed.success && parsed.data.version) return parsed.data.version;
      break;
    }
  }
  throw new Error('PARTY_EVENT_PAYLOAD_INVALID');
}
