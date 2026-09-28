import { describe, expect, it, vi } from 'vitest';
import {
  CONFIGURATION_OUTBOX_CHANNEL,
  ConfigurationOutboxPublisher,
  configurationOutboxEnvelope,
  parseConfigurationOutboxEnvelope,
} from './configuration-outbox.publisher.js';

const validEvent = {
  id: 'outbox_01',
  eventId: 'event_01',
  tenantId: 'tenant_01',
  aggregateId: 'configuration_01',
  eventType: 'configuration.activation.changed.v1',
  attempts: 1,
};

describe('configurationOutboxEnvelope', () => {
  it('creates a minimal, versioned, at-least-once transport envelope', () => {
    expect(configurationOutboxEnvelope(validEvent)).toEqual({
      envelopeVersion: '1.0',
      eventId: 'event_01',
      tenantId: 'tenant_01',
      aggregateId: 'configuration_01',
      eventType: 'configuration.activation.changed.v1',
      attempt: 1,
    });
    expect(CONFIGURATION_OUTBOX_CHANNEL).toBe('gigalibs_configuration_events_v1');
  });

  it.each([
    [{ ...validEvent, eventId: '' }, 'CONFIGURATION_EVENT_ID_INVALID'],
    [{ ...validEvent, tenantId: 'tenant/01' }, 'CONFIGURATION_TENANT_ID_INVALID'],
    [{ ...validEvent, aggregateId: 'configuration 01' }, 'CONFIGURATION_AGGREGATE_ID_INVALID'],
    [
      { ...validEvent, eventType: 'configuration.activation.changed' },
      'CONFIGURATION_EVENT_TYPE_INVALID',
    ],
    [{ ...validEvent, attempts: 0 }, 'CONFIGURATION_EVENT_ATTEMPT_INVALID'],
  ])('rejects an invalid transport field', (event, message) => {
    expect(() => configurationOutboxEnvelope(event)).toThrow(message);
  });
});

describe('parseConfigurationOutboxEnvelope', () => {
  it('accepts only the exact versioned envelope contract', () => {
    const envelope = configurationOutboxEnvelope(validEvent);
    expect(parseConfigurationOutboxEnvelope(JSON.stringify(envelope))).toEqual(envelope);
  });

  it.each([
    ['not-json', 'CONFIGURATION_EVENT_JSON_INVALID'],
    [
      JSON.stringify({ ...configurationOutboxEnvelope(validEvent), unexpected: true }),
      'CONFIGURATION_EVENT_ENVELOPE_INVALID',
    ],
    [
      JSON.stringify({ ...configurationOutboxEnvelope(validEvent), envelopeVersion: '2.0' }),
      'CONFIGURATION_EVENT_ENVELOPE_INVALID',
    ],
  ])('rejects malformed or expanded transport input', (payload, message) => {
    expect(() => parseConfigurationOutboxEnvelope(payload)).toThrow(message);
  });
});

describe('ConfigurationOutboxPublisher', () => {
  it('executes the PostgreSQL notification through the supplied transaction', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ pg_notify: '' }]);
    const publisher = new ConfigurationOutboxPublisher();

    await publisher.publish({ $queryRaw: queryRaw } as never, validEvent);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
