import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ controlOutboxEvent: { findUnique: vi.fn() } }));
vi.mock('@gigalibs/db', () => ({ prisma: database }));

import { PartyProjectionRelayService } from './party-projection-relay.service.js';

const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const original = { ...process.env };
const eventId = randomUUID();
const partyId = randomUUID();
const claim = {
  id: 'outbox-1', eventId, tenantId: 'tenant-a', aggregateId: partyId,
  eventType: 'party.created.v1',
};

describe('kernel Party projection relay', () => {
  beforeEach(() => {
    process.env.BUSINESS_PARTNERS_RELAY_URL = 'http://module-host:4790';
    process.env.BUSINESS_PARTNERS_INBOX_RELAY_PRIVATE_KEY_BASE64 = privateKey;
    database.controlOutboxEvent.findUnique.mockResolvedValue({
      eventId, tenantId: 'tenant-a', aggregateType: 'party', aggregateId: partyId,
      eventType: 'party.created.v1', createdAt: new Date('2026-10-28T08:00:00.000Z'),
      payload: {
        partyId, code: 'BP-A', legalName: 'Partner A', displayName: 'Partner A',
        partyType: 'ORGANIZATION', status: 'ACTIVE', version: 1,
      },
    });
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends one body-bound signed envelope and accepts an idempotent duplicate', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://module-host:4790/business-partners/internal/v1/party-inbox');
      const body = String(init.body);
      const token = String((init.headers as Record<string, string>).Authorization).slice(7);
      expect(verifyRelayToken(token, publicKey, {
        audience: 'gigalibs-business-partners-inbox', source: 'kernel', body,
      })).toMatchObject({ tenant_id: 'tenant-a', message_id: eventId });
      expect(JSON.parse(body)).toMatchObject({ messageId: eventId, aggregateId: partyId, aggregateVersion: 1 });
      return new Response(JSON.stringify({ status: 'DUPLICATE' }), { status: 202 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    await new PartyProjectionRelayService().deliver(claim);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('leaves an unavailable inbox and an invalid event for the control outbox failure path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(new PartyProjectionRelayService().deliver(claim)).rejects.toThrow('PARTY_RELAY_UNAVAILABLE');
    database.controlOutboxEvent.findUnique.mockResolvedValueOnce({
      eventId, tenantId: 'tenant-a', aggregateType: 'party', aggregateId: partyId,
      eventType: 'party.created.v1', createdAt: new Date(), payload: { version: 1 },
    });
    await expect(new PartyProjectionRelayService().deliver(claim)).rejects.toThrow('PARTY_EVENT_PAYLOAD_INVALID');
  });

  it('fails closed when the signing key and destination are absent', async () => {
    delete process.env.BUSINESS_PARTNERS_RELAY_URL;
    delete process.env.BUSINESS_PARTNERS_INBOX_RELAY_PRIVATE_KEY_BASE64;
    await expect(new PartyProjectionRelayService().deliver(claim)).rejects.toThrow('PARTY_RELAY_NOT_CONFIGURED');
  });
});
