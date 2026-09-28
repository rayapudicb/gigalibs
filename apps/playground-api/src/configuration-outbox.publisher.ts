import { Prisma } from '@gigalibs/db';
import { Injectable } from '@nestjs/common';

export const CONFIGURATION_OUTBOX_CHANNEL = 'gigalibs_configuration_events_v1';

export interface ConfigurationOutboxEvent {
  id: string;
  eventId: string;
  tenantId: string;
  aggregateId: string;
  eventType: string;
  attempts: number;
}

export interface ConfigurationOutboxEnvelope {
  envelopeVersion: '1.0';
  eventId: string;
  tenantId: string;
  aggregateId: string;
  eventType: string;
  attempt: number;
}

const versionedConfigurationEvent = /^configuration\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/;
const boundedIdentifier = /^[A-Za-z0-9_-]{1,200}$/;
const postgresNotifyPayloadLimitBytes = 8_000;
const envelopeKeys = [
  'aggregateId',
  'attempt',
  'envelopeVersion',
  'eventId',
  'eventType',
  'tenantId',
] as const;

export function configurationOutboxEnvelope(
  event: ConfigurationOutboxEvent,
): ConfigurationOutboxEnvelope {
  if (!boundedIdentifier.test(event.eventId)) throw new Error('CONFIGURATION_EVENT_ID_INVALID');
  if (!boundedIdentifier.test(event.tenantId)) throw new Error('CONFIGURATION_TENANT_ID_INVALID');
  if (!boundedIdentifier.test(event.aggregateId))
    throw new Error('CONFIGURATION_AGGREGATE_ID_INVALID');
  if (!versionedConfigurationEvent.test(event.eventType))
    throw new Error('CONFIGURATION_EVENT_TYPE_INVALID');
  if (!Number.isSafeInteger(event.attempts) || event.attempts < 1)
    throw new Error('CONFIGURATION_EVENT_ATTEMPT_INVALID');
  return {
    envelopeVersion: '1.0',
    eventId: event.eventId,
    tenantId: event.tenantId,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    attempt: event.attempts,
  };
}

export function parseConfigurationOutboxEnvelope(payload: string): ConfigurationOutboxEnvelope {
  if (Buffer.byteLength(payload, 'utf8') >= postgresNotifyPayloadLimitBytes)
    throw new Error('CONFIGURATION_EVENT_PAYLOAD_TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error('CONFIGURATION_EVENT_JSON_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('CONFIGURATION_EVENT_ENVELOPE_INVALID');
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).sort().join('|') !== [...envelopeKeys].sort().join('|') ||
    candidate.envelopeVersion !== '1.0'
  ) {
    throw new Error('CONFIGURATION_EVENT_ENVELOPE_INVALID');
  }
  if (
    typeof candidate.eventId !== 'string' ||
    typeof candidate.tenantId !== 'string' ||
    typeof candidate.aggregateId !== 'string' ||
    typeof candidate.eventType !== 'string' ||
    typeof candidate.attempt !== 'number'
  ) {
    throw new Error('CONFIGURATION_EVENT_ENVELOPE_INVALID');
  }
  return configurationOutboxEnvelope({
    id: candidate.eventId,
    eventId: candidate.eventId,
    tenantId: candidate.tenantId,
    aggregateId: candidate.aggregateId,
    eventType: candidate.eventType,
    attempts: candidate.attempt,
  });
}

@Injectable()
export class ConfigurationOutboxPublisher {
  async publish(transaction: Prisma.TransactionClient, event: ConfigurationOutboxEvent) {
    const payload = JSON.stringify(configurationOutboxEnvelope(event));
    if (Buffer.byteLength(payload, 'utf8') >= postgresNotifyPayloadLimitBytes)
      throw new Error('CONFIGURATION_EVENT_PAYLOAD_TOO_LARGE');

    // pg_notify participates in the surrounding transaction. PostgreSQL sends the notification only
    // after the transaction commits, so PUBLISHED and the transport receipt cannot diverge at commit.
    // Consumers treat eventId as an at-least-once idempotency key and resynchronize from PostgreSQL.
    await transaction.$queryRaw(
      Prisma.sql`SELECT pg_notify(${CONFIGURATION_OUTBOX_CHANNEL}, ${payload})::text AS "notification"`,
    );
  }
}
