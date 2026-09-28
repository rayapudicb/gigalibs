/**
 * WI-OI-068 — Workforce side of the CMMS handshake (ADR-0007 option A): relay configuration, the inbox guard's
 * token checks, and the inbox's receipt deduplication and receipted refusals. Live delivery, replay and
 * isolation are certified by verify-cmms-workforce-handshake.sh.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { signRelayToken } from '@gigalibs/auth-core';
import { describe, expect, it, vi } from 'vitest';
import { WorkforceInboxService } from './inbox.service.js';
import { CMMS_INBOX_AUDIENCE, WORKFORCE_INBOX_AUDIENCE, loadWorkforceRelayConfig } from './relay-config.js';
import { type RelayRequest, RelayInboxGuard } from './relay-inbox.guard.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  return { publicBase64: publicKey.toString('base64'), privatePem: privateKey };
}

const inboxKeys = keyPair();
const config = loadWorkforceRelayConfig({ WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64: inboxKeys.publicBase64 });
const WORK_ORDER = randomUUID();

function staffingEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    messageId: randomUUID(),
    tenantId: 'wftenant0001',
    eventType: 'CMMS_STAFFING_REQUESTED_V1',
    aggregateType: 'CMMS_STAFFING_REQUEST',
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    correlationId: 'wi-oi-068-unit',
    causationId: null,
    schemaVersion: 1,
    payload: {
      staffingId: randomUUID(),
      workOrderId: WORK_ORDER,
      woNumber: 'WO-000001',
      title: 'Replace pump seal',
      siteRef: null,
      startsAt: '2026-10-01T08:00:00.000Z',
      endsAt: '2026-10-01T12:00:00.000Z',
      headcount: 1,
      capabilityCodes: ['MECH-L2'],
      requestKey: randomUUID(),
    },
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function tokenFor(body: Record<string, unknown>, options: { audience?: string; source?: string; key?: string } = {}) {
  return signRelayToken(
    {
      audience: options.audience ?? WORKFORCE_INBOX_AUDIENCE,
      source: options.source ?? 'cmms',
      tenantId: body.tenantId as string,
      messageId: body.messageId as string,
      body: JSON.stringify(body),
    },
    options.key ?? inboxKeys.privatePem,
  );
}

function activate(guard: RelayInboxGuard, body: Record<string, unknown>, token: string) {
  const raw = JSON.stringify(body);
  const request: RelayRequest = { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body: JSON.parse(raw) };
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);
}

describe('Workforce relay configuration', () => {
  it('stays off without keys and targets only the CMMS service origin', () => {
    expect(loadWorkforceRelayConfig({})).toMatchObject({ inboxPublicKey: null, outbound: null, intervalMs: 1_000 });
    const signing = keyPair().privatePem;
    const der = Buffer.from(signing.replace(/-----[^-]+-----|\s/g, ''), 'base64').toString('base64');
    expect(loadWorkforceRelayConfig({ WORKFORCE_RELAY_CMMS_URL: 'http://cmms-api:4200', CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64: der }).outbound?.targetOrigin)
      .toBe('http://cmms-api:4200');
    expect(() => loadWorkforceRelayConfig({ WORKFORCE_RELAY_CMMS_URL: 'http://attacker.example:4200', CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64: der })).toThrow();
    expect(() => loadWorkforceRelayConfig({ CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64: der })).toThrow(/or neither/);
    expect(() => loadWorkforceRelayConfig({ WORKFORCE_RELAY_INTERVAL_MS: '0' })).toThrow(/between 100 and 60000/);
  });
});

describe('Workforce relay inbox guard', () => {
  const guard = new RelayInboxGuard(config);

  it('accepts a CMMS relay token for this exact envelope', () => {
    const body = staffingEnvelope();
    expect(activate(guard, body, tokenFor(body))).toBe(true);
  });

  it.each([
    ['the CMMS inbox audience', { audience: CMMS_INBOX_AUDIENCE }],
    ['a Workforce-sourced token', { source: 'workforce' }],
    ['a foreign signing key', { key: keyPair().privatePem }],
  ])('rejects %s', (_label, options) => {
    const body = staffingEnvelope();
    expect(() => activate(guard, body, tokenFor(body, options))).toThrow(/rejected/);
  });

  it('rejects a token issued for another message', () => {
    const body = staffingEnvelope();
    const other = staffingEnvelope();
    expect(() => activate(guard, body, tokenFor({ ...body, messageId: other.messageId }))).toThrow(/rejected|does not match/);
  });
});

describe('Workforce inbox', () => {
  function inboxWith(options: { receiptInserted: boolean; knownCodes?: string[] }) {
    const statements: { sql: string; values: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('INSERT INTO gigalibs_workforce.inbox_receipts')) {
          return { rows: options.receiptInserted ? [{ id: 'receipt-1' }] : [], rowCount: options.receiptInserted ? 1 : 0 };
        }
        if (sql.includes('FROM gigalibs_workforce.capability_definitions')) {
          return { rows: (options.knownCodes ?? []).map((code) => ({ id: randomUUID(), code })), rowCount: options.knownCodes?.length ?? 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, work: (c: typeof client) => unknown) => work(client)) };
    const bookings = { createRequirementWithClient: vi.fn(async () => ({})), cancelRequirementWithClient: vi.fn(async () => ({})) };
    return { inbox: new WorkforceInboxService(database as never, bookings as never), statements, bookings };
  }

  it('opens a requirement for a known capability as the relay principal', async () => {
    const { inbox, bookings } = inboxWith({ receiptInserted: true, knownCodes: ['MECH-L2'] });
    const body = staffingEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    const [, context, input] = bookings.createRequirementWithClient.mock.calls[0] as unknown as [unknown, { principal: { subject: string } }, Record<string, unknown>];
    expect(context.principal.subject).toBe('relay:cmms');
    expect(input).toMatchObject({ sourceType: 'CMMS_WORK_ORDER', sourceRef: WORK_ORDER, requestKey: (body.payload as { requestKey: string }).requestKey });
  });

  it('receipts an unknown capability and answers with a keyed refusal fact', async () => {
    const { inbox, statements, bookings } = inboxWith({ receiptInserted: true, knownCodes: [] });
    const body = staffingEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'REJECTED', code: 'WORKFORCE_CAPABILITY_UNKNOWN' });
    expect(bookings.createRequirementWithClient).not.toHaveBeenCalled();
    const fact = statements.find((statement) => statement.sql.includes('INSERT INTO gigalibs_workforce.outbox_events'))!;
    expect(fact.values[10]).toBe('WORKFORCE_STAFFING_REQUEST_REJECTED_V1');
    expect(JSON.parse(fact.values.at(-1) as string)).toMatchObject({
      sourceType: 'CMMS_WORK_ORDER',
      sourceRef: WORK_ORDER,
      requestKey: (body.payload as { requestKey: string }).requestKey,
      code: 'WORKFORCE_CAPABILITY_UNKNOWN',
    });
    expect(statements.at(-1)?.values.slice(2)).toEqual(['FAILED', 'WORKFORCE_CAPABILITY_UNKNOWN']);
  });

  it('treats a redelivered message as a duplicate with no effect', async () => {
    const { inbox, statements, bookings } = inboxWith({ receiptInserted: false, knownCodes: ['MECH-L2'] });
    const body = staffingEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'DUPLICATE' });
    expect(statements).toHaveLength(1);
    expect(bookings.createRequirementWithClient).not.toHaveBeenCalled();
  });

  it('receipts a cancellation with nothing live to cancel', async () => {
    const { inbox, bookings } = inboxWith({ receiptInserted: true });
    const body = staffingEnvelope({
      eventType: 'CMMS_STAFFING_CANCELLED_V1',
      payload: { staffingId: randomUUID(), workOrderId: WORK_ORDER, reason: 'Work order cancelled.' },
    });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED', code: 'NOTHING_TO_CANCEL' });
    expect(bookings.cancelRequirementWithClient).not.toHaveBeenCalled();
  });
});
