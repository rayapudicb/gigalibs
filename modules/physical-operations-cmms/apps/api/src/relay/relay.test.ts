/**
 * WI-OI-068 — CMMS side of the Workforce handshake (ADR-0007 option A): relay configuration, the inbox guard's
 * token checks, and the inbox's receipt deduplication and request-key matching. Live delivery, replay and
 * isolation are certified by verify-cmms-workforce-handshake.sh.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { signRelayToken } from '@gigalibs/auth-core';
import { describe, expect, it, vi } from 'vitest';
import { CmmsInboxService } from './inbox.service.js';
import { CMMS_INBOX_AUDIENCE, WORKFORCE_INBOX_AUDIENCE, loadCmmsRelayConfig } from './relay-config.js';
import { type RelayRequest, RelayInboxGuard } from './relay-inbox.guard.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
  });
  return { publicBase64: publicKey.toString('base64'), privateBase64: privateKey.toString('base64') };
}

const inboxKeys = keyPair();
const outboundKeys = keyPair();
const config = loadCmmsRelayConfig({
  CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64: inboxKeys.publicBase64,
  CMMS_RELAY_WORKFORCE_URL: 'http://workforce-api:4700',
  WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64: outboundKeys.privateBase64,
});
const inboxSigningPem = loadCmmsRelayConfig({
  CMMS_RELAY_WORKFORCE_URL: 'http://workforce-api:4700',
  WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64: inboxKeys.privateBase64,
}).outbound!.privateKey;

const WORK_ORDER = randomUUID();
const REQUEST_KEY = randomUUID();

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    messageId: randomUUID(),
    tenantId: 'cmtenant0001',
    eventType: 'WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1',
    aggregateType: 'WORKFORCE_WORK_REQUIREMENT',
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    correlationId: 'wi-oi-068-unit',
    causationId: null,
    schemaVersion: 1,
    payload: { sourceType: 'CMMS_WORK_ORDER', sourceRef: WORK_ORDER, requestKey: REQUEST_KEY },
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function relayRequest(body: Record<string, unknown>, token: string): RelayRequest {
  const raw = JSON.stringify(body);
  return { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body: JSON.parse(raw) };
}

function tokenFor(body: Record<string, unknown>, options: { audience?: string; source?: string; key?: string; tenantId?: string } = {}) {
  return signRelayToken(
    {
      audience: options.audience ?? CMMS_INBOX_AUDIENCE,
      source: options.source ?? 'workforce',
      tenantId: options.tenantId ?? (body.tenantId as string),
      messageId: body.messageId as string,
      body: JSON.stringify(body),
    },
    options.key ?? inboxSigningPem,
  );
}

function activate(guard: RelayInboxGuard, request: RelayRequest) {
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);
}

describe('CMMS relay configuration', () => {
  it('stays off without keys and targets only the Workforce service origin', () => {
    expect(loadCmmsRelayConfig({})).toMatchObject({ inboxPublicKey: null, outbound: null, intervalMs: 1_000 });
    expect(config.outbound?.targetOrigin).toBe('http://workforce-api:4700');
    expect(() => loadCmmsRelayConfig({ CMMS_RELAY_WORKFORCE_URL: 'http://workforce-api:4700' })).toThrow(/or neither/);
    for (const target of ['http://evil.example:4700', 'http://workforce-api:4700/internal', 'http://user:pw@workforce-api:4700', 'file:///etc/passwd']) {
      expect(() =>
        loadCmmsRelayConfig({ CMMS_RELAY_WORKFORCE_URL: target, WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64: outboundKeys.privateBase64 }),
      ).toThrow();
    }
  });

  it('refuses malformed keys and intervals', () => {
    expect(() => loadCmmsRelayConfig({ CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64: 'bm90LWEta2V5' })).toThrow(/Ed25519/);
    expect(() => loadCmmsRelayConfig({ CMMS_RELAY_INTERVAL_MS: 'soon' })).toThrow(/between 100 and 60000/);
    expect(() => loadCmmsRelayConfig({ CMMS_RELAY_INTERVAL_MS: '5' })).toThrow(/between 100 and 60000/);
  });
});

describe('CMMS relay inbox guard', () => {
  const guard = new RelayInboxGuard(config);

  it('accepts a Workforce relay token bound to this tenant, message and body', () => {
    const body = envelope();
    const request = relayRequest(body, tokenFor(body));
    expect(activate(guard, request)).toBe(true);
    expect(request.relayClaims).toMatchObject({ sub: 'workforce', tenant_id: 'cmtenant0001', message_id: body.messageId });
  });

  it.each([
    ['the Workforce inbox audience', { audience: WORKFORCE_INBOX_AUDIENCE }],
    ['a CMMS-sourced token', { source: 'cmms' }],
    ['a foreign signing key', { key: keyPairPem() }],
    ['another tenant', { tenantId: 'othertenant' }],
  ])('rejects %s', (_label, options) => {
    const body = envelope();
    expect(() => activate(guard, relayRequest(body, tokenFor(body, options)))).toThrow(/rejected|does not match/);
  });

  it('rejects a body changed after signing and a missing token', () => {
    const body = envelope();
    const token = tokenFor(body);
    const tampered = relayRequest({ ...body, aggregateVersion: 9 }, token);
    expect(() => activate(guard, tampered)).toThrow(/rejected/);
    expect(() => activate(guard, { headers: {}, rawBody: Buffer.from('{}'), body: {} })).toThrow(/required/);
  });

  it('answers 503 when the inbox key is not configured', () => {
    const body = envelope();
    expect(() => activate(new RelayInboxGuard(loadCmmsRelayConfig({})), relayRequest(body, tokenFor(body)))).toThrow(/not configured/);
  });
});

describe('CMMS inbox', () => {
  function inboxWith(receiptInserted: boolean) {
    const statements: { sql: string; values: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('INSERT INTO gigalibs_cmms.inbox_receipts')) return { rows: receiptInserted ? [{ id: 'receipt-1' }] : [], rowCount: receiptInserted ? 1 : 0 };
        if (sql.includes('SELECT id FROM gigalibs_cmms.work_orders')) return { rows: [{ id: WORK_ORDER }], rowCount: 1 };
        if (sql.includes('UPDATE gigalibs_cmms.work_order_staffing')) return { rows: [{ status: 'ACCEPTED' }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, work: (c: typeof client) => unknown) => work(client)) };
    return { inbox: new CmmsInboxService(database as never), statements };
  }

  it('applies a requirement fact to the request with the same key, once', async () => {
    const { inbox, statements } = inboxWith(true);
    const body = envelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    const update = statements.find((statement) => statement.sql.includes('UPDATE gigalibs_cmms.work_order_staffing'))!;
    expect(update.sql).toContain('request_key = $3::uuid');
    expect(update.values).toEqual(['cmtenant0001', WORK_ORDER, REQUEST_KEY, body.aggregateId]);
    expect(statements.some((statement) => statement.sql.includes("'STAFFING_UPDATED', 'relay:workforce'"))).toBe(true);
    expect(statements.some((statement) => statement.sql.includes('INSERT INTO gigalibs_cmms.outbox_events'))).toBe(true);
    expect(statements.at(-1)?.values.slice(2)).toEqual(['PROCESSED', null]);
  });

  it('treats a redelivered message as a duplicate with no effect', async () => {
    const { inbox, statements } = inboxWith(false);
    const body = envelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'DUPLICATE' });
    expect(statements).toHaveLength(1);
  });

  it('never settles a request from a refusal without its request key', async () => {
    const { inbox, statements } = inboxWith(true);
    const body = envelope({
      eventType: 'WORKFORCE_STAFFING_REQUEST_REJECTED_V1',
      payload: { sourceType: 'CMMS_WORK_ORDER', sourceRef: WORK_ORDER, requestKey: null, code: 'WORKFORCE_CANCELLATION_REFUSED', reason: 'Someone is on site.' },
    });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(statements.some((statement) => statement.sql.includes('UPDATE gigalibs_cmms.work_order_staffing'))).toBe(false);
  });

  it('projects bookings only when the Workforce version is newer', async () => {
    const { inbox, statements } = inboxWith(true);
    const body = envelope({
      eventType: 'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
      aggregateType: 'WORKFORCE_BOOKING',
      aggregateVersion: 3,
      payload: {
        sourceType: 'CMMS_WORK_ORDER', sourceRef: WORK_ORDER, requirementId: randomUUID(), resourceId: randomUUID(),
        resourceName: 'Asha Rao', startsAt: '2026-10-01T08:00:00.000Z', endsAt: '2026-10-01T12:00:00.000Z', from: 'DRAFT', to: 'CONFIRMED',
      },
    });
    await inbox.receive(body, JSON.stringify(body));
    const upsert = statements.find((statement) => statement.sql.includes('INSERT INTO gigalibs_cmms.work_order_bookings'))!;
    expect(upsert.sql).toContain('source_version < EXCLUDED.source_version');
    expect(upsert.values.slice(-2)).toEqual(['CONFIRMED', 3]);
  });

  it('refuses unknown event types and malformed envelopes before touching the database', async () => {
    const { inbox, statements } = inboxWith(true);
    const unknown = envelope({ eventType: 'WORKFORCE_PERSON_CREATED_V1' });
    await expect(inbox.receive(unknown, JSON.stringify(unknown))).rejects.toThrow(/No consumer/);
    await expect(inbox.receive({ messageId: 'x' }, '{}')).rejects.toThrow();
    expect(statements).toHaveLength(0);
  });
});

function keyPairPem(): string {
  return generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}
