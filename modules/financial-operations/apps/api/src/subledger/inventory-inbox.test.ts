/**
 * WI-OI-120fq (F2.1): Finance inbox for inventory.receipt.completed.v1 — guard, dedupe, costing handoff.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { signRelayToken } from '@gigalibs/auth-core';
import { describe, expect, it, vi } from 'vitest';
import { FinanceRelayInboxGuard } from '../relay/inbox.guard.js';
import { FINANCE_INBOX_AUDIENCE, loadFinanceRelayConfig } from '../relay/relay-config.js';
import { InventorySubledgerInboxService } from './inventory-inbox.service.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  return { publicBase64: publicKey.toString('base64'), privatePem: privateKey };
}

const inboxKeys = keyPair();
const config = loadFinanceRelayConfig({ FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64: inboxKeys.publicBase64 });
const TENANT = 'invtenant001';

function receiptEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    messageId: randomUUID(),
    tenantId: TENANT,
    eventType: 'inventory.receipt.completed.v1',
    aggregateType: 'INVENTORY_RECEIPT',
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    correlationId: 'wi-oi-120fq-unit',
    causationId: null,
    schemaVersion: 1,
    payload: {
      receiptId: randomUUID(),
      receiptNumber: 'GR-120FQ-1',
      warehouseId: randomUUID(),
      receivedAt: '2026-10-18T00:00:00.000Z',
      lines: [
        {
          receiptLineId: randomUUID(),
          productId: randomUUID(),
          receivedQuantity: '5',
          uomId: randomUUID(),
        },
      ],
    },
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function tokenFor(body: Record<string, unknown>, options: { audience?: string; source?: string; key?: string } = {}) {
  return signRelayToken(
    {
      audience: options.audience ?? FINANCE_INBOX_AUDIENCE,
      source: options.source ?? 'inventory',
      tenantId: body.tenantId as string,
      messageId: body.messageId as string,
      body: JSON.stringify(body),
    },
    options.key ?? inboxKeys.privatePem,
  );
}

function activate(guard: FinanceRelayInboxGuard, body: Record<string, unknown>, token: string) {
  const raw = JSON.stringify(body);
  const request = { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body: JSON.parse(raw) };
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);
}

describe('Finance inventory relay inbox guard', () => {
  const guard = new FinanceRelayInboxGuard(config);

  it('accepts an Inventory relay token for this envelope', () => {
    const body = receiptEnvelope();
    expect(activate(guard, body, tokenFor(body))).toBe(true);
  });

  it('rejects a foreign audience or source', () => {
    const body = receiptEnvelope();
    expect(() => activate(guard, body, tokenFor(body, { audience: 'other' }))).toThrow(/rejected/);
    expect(() => activate(guard, body, tokenFor(body, { source: 'cmms' }))).toThrow(/rejected/);
  });
});

describe('Finance inventory subledger inbox', () => {
  function inboxWith(options: { receiptInserted: boolean; costProfile?: { id: string; standard_unit_cost_scaled: string } }) {
    const costing = { ingestReceiptLayer: vi.fn(async () => ({})) };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_finance.inbox_receipts')) {
          return { rows: options.receiptInserted ? [{ id: 'receipt-1' }] : [], rowCount: options.receiptInserted ? 1 : 0 };
        }
        if (sql.includes('accounting_books')) {
          return { rows: [{ id: 'book-1' }], rowCount: 1 };
        }
        if (sql.includes('fiscal_periods')) {
          return { rows: [{ id: 'period-1', status: 'OPEN', period_name: '2026-10' }], rowCount: 1 };
        }
        if (sql.includes('FROM gigalibs_finance.cost_profiles')) {
          return {
            rows: options.costProfile ? [options.costProfile] : [],
            rowCount: options.costProfile ? 1 : 0,
          };
        }
        if (sql.includes('UPDATE gigalibs_finance.inbox_receipts')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('subledger_posting_register') || sql.includes('gl_journals')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, work: (c: typeof client) => unknown) => work(client)) };
    const postingStatusSync = { setStatus: vi.fn(async () => undefined) };
    return {
      inbox: new InventorySubledgerInboxService(database as never, costing as never, postingStatusSync as never),
      costing,
      postingStatusSync,
    };
  }

  it('ingests receipt layers when a default cost profile exists', async () => {
    const { inbox, costing } = inboxWith({
      receiptInserted: true,
      costProfile: { id: randomUUID(), standard_unit_cost_scaled: '1000000000' },
    });
    const body = receiptEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(costing.ingestReceiptLayer).toHaveBeenCalledWith(
      TENANT,
      'relay:inventory',
      expect.objectContaining({
        postGlJournal: true,
        bookId: 'book-1',
        periodId: 'period-1',
        sourceDocumentType: 'INVENTORY_RECEIPT',
        journalEntryType: 'SUBLEDGER_INVENTORY',
      }),
    );
  });

  it('treats a redelivered message as DUPLICATE without calling costing', async () => {
    const { inbox, costing } = inboxWith({
      receiptInserted: false,
      costProfile: { id: randomUUID(), standard_unit_cost_scaled: '1000000000' },
    });
    const body = receiptEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'DUPLICATE' });
    expect(costing.ingestReceiptLayer).not.toHaveBeenCalled();
  });

  it('receipts a locked fiscal period without calling costing', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_finance.inbox_receipts')) {
          return { rows: [{ id: 'receipt-1' }], rowCount: 1 };
        }
        if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
        if (sql.includes('fiscal_periods')) {
          return { rows: [{ id: 'period-1', status: 'LOCKED', period_name: '2026-09' }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const postingStatusSync = { setStatus: vi.fn(async () => undefined) };
    const inbox = new InventorySubledgerInboxService(
      database as never,
      { ingestReceiptLayer: vi.fn() } as never,
      postingStatusSync as never,
    );
    const body = receiptEnvelope({
      payload: {
        receiptId: randomUUID(),
        receiptNumber: 'GR-LOCKED',
        warehouseId: randomUUID(),
        receivedAt: '2026-09-10T00:00:00.000Z',
        lines: [
          {
            receiptLineId: randomUUID(),
            productId: randomUUID(),
            receivedQuantity: '1',
            uomId: randomUUID(),
          },
        ],
      },
    });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({
      status: 'REJECTED',
      code: 'FINANCE_PERIOD_LOCKED',
    });
  });

  it('receipts without a cost profile as REJECTED', async () => {
    const { inbox, costing } = inboxWith({ receiptInserted: true });
    const body = receiptEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({
      status: 'REJECTED',
      code: 'FINANCE_COST_PROFILE_MISSING',
    });
    expect(costing.ingestReceiptLayer).not.toHaveBeenCalled();
  });
});
