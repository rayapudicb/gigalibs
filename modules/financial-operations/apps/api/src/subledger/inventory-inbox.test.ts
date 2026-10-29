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
const FINANCE_PROFILE_ID = randomUUID();

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
      orgUnitId: 'operating-unit-a',
      financeCostProfileId: FINANCE_PROFILE_ID,
      valuationMethod: 'FIFO',
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
  function inboxWith(options: { receiptInserted: boolean; costProfile?: { id: string; standard_unit_cost_scaled: string; costing_method?: string } }) {
    const costing = {
      ingestReceiptLayer: vi.fn(async () => ({ id: randomUUID(), totalInitialCostMinor: '500' })),
      resolveProductStandardUnitCostScaled: vi.fn(async () =>
        options.costProfile ? options.costProfile.standard_unit_cost_scaled : null,
      ),
    };
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
            rows: options.costProfile ? [{ id: options.costProfile.id, costing_method: options.costProfile.costing_method ?? 'FIFO' }] : [],
            rowCount: options.costProfile ? 1 : 0,
          };
        }
        if (sql.includes('product_standard_costs')) {
          return {
            rows: options.costProfile
              ? [{ standard_unit_cost_scaled: options.costProfile.standard_unit_cost_scaled }]
              : [],
            rowCount: options.costProfile ? 1 : 0,
          };
        }
        if (sql.includes('posting_date')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_finance.inbox_receipts')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('inventory_fiscal_replica_publish')) {
          return { rows: [{ tenant_id: TENANT }], rowCount: 1 };
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM gigalibs_finance.outbox_events') && sql.includes('aggregate_version')) {
          return { rows: [{ version: 1 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO gigalibs_finance.outbox_events')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO gigalibs_finance.inventory_fiscal_replica_publish')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('subledger_posting_register') || sql.includes('gl_journals')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, work: (c: typeof client) => unknown) => work(client)) };
    return {
      inbox: new InventorySubledgerInboxService(database as never, costing as never),
      costing,
      client,
    };
  }

  it('ingests receipt layers through the organization-selected Finance cost profile', async () => {
    const { inbox, costing, client } = inboxWith({
      receiptInserted: true,
      costProfile: { id: FINANCE_PROFILE_ID, standard_unit_cost_scaled: '1000000000' },
    });
    const body = receiptEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(client.query.mock.calls.some(([sql, params]) => String(sql).includes('FROM gigalibs_finance.cost_profiles') &&
      (params as unknown[])?.[1] === FINANCE_PROFILE_ID)).toBe(true);
    const outboxInserts = client.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO gigalibs_finance.outbox_events'),
    );
    expect(outboxInserts.length).toBeGreaterThan(0);
    expect(
      outboxInserts.some(([sql, params]) =>
        String(sql).includes('event_type') &&
        (params as unknown[])?.some((value) => value === 'finance.inventory-receipt.posting-outcome.v1'),
      ),
    ).toBe(true);
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
      expect.anything(),
    );
    expect(costing.ingestReceiptLayer.mock.calls[0]?.[3]).toBe(client);
  });

  it('treats a redelivered message as DUPLICATE without calling costing', async () => {
    const { inbox, costing } = inboxWith({
      receiptInserted: false,
      costProfile: { id: FINANCE_PROFILE_ID, standard_unit_cost_scaled: '1000000000' },
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
        if (sql.includes('inventory_fiscal_replica_publish')) {
          return { rows: [{ tenant_id: TENANT }], rowCount: 1 };
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM gigalibs_finance.outbox_events') && sql.includes('aggregate_version')) {
          return { rows: [{ version: 1 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO gigalibs_finance.outbox_events')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM gigalibs_finance.fiscal_periods')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO gigalibs_finance.inventory_fiscal_replica_publish')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new InventorySubledgerInboxService(database as never, { ingestReceiptLayer: vi.fn() } as never);
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

  it('passes the inbox transaction client into ingestReceiptLayer for every line', async () => {
    const line1 = randomUUID();
    const line2 = randomUUID();
    let ingestCalls = 0;
    const costing = {
      ingestReceiptLayer: vi.fn(async (_tenant: string, _actor: string, _input: unknown, client?: unknown) => {
        ingestCalls += 1;
        if (ingestCalls === 2) throw new Error('line 2 failed');
        expect(client).toBeDefined();
        return {};
      }),
      resolveProductStandardUnitCostScaled: vi.fn(async () => '1000000000'),
    };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_finance.inbox_receipts')) {
          return { rows: [{ id: 'receipt-1' }], rowCount: 1 };
        }
        if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
        if (sql.includes('fiscal_periods')) {
          return { rows: [{ id: 'period-1', status: 'OPEN', period_name: '2026-10' }] };
        }
        if (sql.includes('FROM gigalibs_finance.cost_profiles')) {
          return { rows: [{ id: FINANCE_PROFILE_ID, costing_method: 'FIFO' }], rowCount: 1 };
        }
        if (sql.includes('product_standard_costs')) {
          return { rows: [{ standard_unit_cost_scaled: '1000000000' }], rowCount: 1 };
        }
        if (sql.includes('posting_date')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('inventory_fiscal_replica_publish')) {
          return { rows: [{ tenant_id: TENANT }], rowCount: 1 };
        }
        if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1 };
        if (sql.includes('outbox_events')) return { rows: [{ version: 1 }], rowCount: 1 };
        if (sql.includes('subledger_posting_register')) return { rowCount: 1 };
        if (sql.includes('UPDATE gigalibs_finance.inbox_receipts')) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new InventorySubledgerInboxService(database as never, costing as never);
    const body = receiptEnvelope({
      payload: {
        receiptId: randomUUID(),
        receiptNumber: 'GR-MULTI',
        warehouseId: randomUUID(),
        orgUnitId: 'operating-unit-a',
        financeCostProfileId: FINANCE_PROFILE_ID,
        valuationMethod: 'FIFO',
        receivedAt: '2026-10-18T00:00:00.000Z',
        lines: [
          { receiptLineId: line1, productId: randomUUID(), receivedQuantity: '2', uomId: randomUUID() },
          { receiptLineId: line2, productId: randomUUID(), receivedQuantity: '3', uomId: randomUUID() },
        ],
      },
    });
    await expect(inbox.receive(body, JSON.stringify(body))).rejects.toThrow('line 2 failed');
    expect(ingestCalls).toBe(2);
    expect(costing.ingestReceiptLayer.mock.calls[0]?.[3]).toBe(client);
    expect(costing.ingestReceiptLayer.mock.calls[1]?.[3]).toBe(client);
  });

  it('receipts without a cost profile as REJECTED', async () => {
    const { inbox, costing, client } = inboxWith({ receiptInserted: true });
    const body = receiptEnvelope();
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({
      status: 'REJECTED',
      code: 'FINANCE_COST_PROFILE_MISSING',
    });
    expect(costing.ingestReceiptLayer).not.toHaveBeenCalled();
    const outboxInserts = client.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO gigalibs_finance.outbox_events'),
    );
    expect(
      outboxInserts.some(([, params]) =>
        JSON.stringify(params ?? []).includes('POSTING_REJECTED'),
      ),
    ).toBe(true);
  });

  it('rejects a missing organization profile and a method mismatch before costing', async () => {
    const { inbox, costing } = inboxWith({ receiptInserted: true,
      costProfile: { id: FINANCE_PROFILE_ID, standard_unit_cost_scaled: '1000000000', costing_method: 'STANDARD' } });
    const missing = receiptEnvelope({
      payload: { ...receiptEnvelope().payload, financeCostProfileId: undefined },
    });
    await expect(inbox.receive(missing, JSON.stringify(missing))).resolves.toEqual({
      status: 'REJECTED', code: 'FINANCE_ORG_COST_PROFILE_MISSING',
    });
    const mismatch = receiptEnvelope();
    await expect(inbox.receive(mismatch, JSON.stringify(mismatch))).resolves.toEqual({
      status: 'REJECTED', code: 'FINANCE_COST_METHOD_MISMATCH',
    });
    expect(costing.ingestReceiptLayer).not.toHaveBeenCalled();
  });

  it('checks every receipt line cost before posting any layer or journal', async () => {
    const { inbox, costing } = inboxWith({ receiptInserted: true,
      costProfile: { id: FINANCE_PROFILE_ID, standard_unit_cost_scaled: '1000000000' } });
    costing.resolveProductStandardUnitCostScaled
      .mockResolvedValueOnce('1000000000')
      .mockResolvedValueOnce(null);
    const base = receiptEnvelope();
    const first = base.payload.lines[0]!;
    const body = receiptEnvelope({ payload: {
      ...base.payload,
      lines: [first, { ...first, receiptLineId: randomUUID(), productId: randomUUID() }],
    } });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({
      status: 'REJECTED', code: 'FINANCE_STANDARD_COST_MISSING',
    });
    expect(costing.ingestReceiptLayer).not.toHaveBeenCalled();
  });

  it('posts in-transit clearance for a transfer dispatch fact', async () => {
    const postInventoryTransferJournal = vi.fn(async () => undefined);
    const costing = {
      ingestReceiptLayer: vi.fn(),
      resolveProductStandardUnitCostScaled: vi.fn(async () => '1000000000'),
      postInventoryTransferJournal,
    };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_finance.inbox_receipts')) return { rows: [{ id: 'r1' }], rowCount: 1 };
        if (sql.includes('currency_code')) return { rows: [{ currency_code: 'USD' }] };
        if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
        if (sql.includes('fiscal_periods')) return { rows: [{ id: 'period-1', status: 'OPEN' }] };
        if (sql.includes('cost_profiles')) {
          return {
            rows: [{
              id: FINANCE_PROFILE_ID,
              costing_method: 'FIFO',
              inventory_gl_account_id: randomUUID(),
              landed_cost_clearing_gl_account_id: randomUUID(),
            }],
          };
        }
        if (sql.includes('inventory_fiscal_replica_publish')) return { rows: [{ tenant_id: TENANT }] };
        if (sql.includes('subledger_posting_register')) return { rowCount: 1 };
        if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new InventorySubledgerInboxService(database as never, costing as never);
    const productId = randomUUID();
    const body = receiptEnvelope({
      eventType: 'inventory.transfer.dispatched.v1',
      aggregateType: 'transfer',
      payload: {
        transferId: randomUUID(),
        transferNumber: 'TR-1',
        sourceWarehouseId: randomUUID(),
        targetWarehouseId: randomUUID(),
        orgUnitId: 'operating-unit-a',
        financeCostProfileId: FINANCE_PROFILE_ID,
        valuationMethod: 'FIFO',
        lines: [{ productId, uomId: randomUUID(), quantity: '2' }],
      },
    });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(postInventoryTransferJournal).toHaveBeenCalledTimes(1);
  });

  it('posts WIP clearing for a manufacturing production completion fact', async () => {
    const postInventoryTransferJournal = vi.fn(async () => undefined);
    const costing = {
      ingestReceiptLayer: vi.fn(),
      resolveProductStandardUnitCostScaled: vi.fn(async () => '1000000000'),
      postInventoryTransferJournal,
    };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('AS posted')) return { rows: [{ posted: true }] };
        if (sql.includes('INSERT INTO gigalibs_finance.inbox_receipts')) return { rows: [{ id: 'r1' }], rowCount: 1 };
        if (sql.includes('currency_code')) return { rows: [{ currency_code: 'USD' }] };
        if (sql.includes('accounting_books')) return { rows: [{ id: 'book-1' }] };
        if (sql.includes('fiscal_periods')) return { rows: [{ id: 'period-1', status: 'OPEN' }] };
        if (sql.includes('cost_profiles')) {
          return {
            rows: [{
              id: FINANCE_PROFILE_ID,
              costing_method: 'STANDARD',
              inventory_gl_account_id: randomUUID(),
              grni_gl_account_id: randomUUID(),
              manufacturing_wip_gl_account_id: randomUUID(),
              manufacturing_variance_gl_account_id: randomUUID(),
            }],
          };
        }
        if (sql.includes('inventory_fiscal_replica_publish')) return { rows: [{ tenant_id: TENANT }] };
        if (sql.includes('subledger_posting_register')) return { rowCount: 1 };
        if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new InventorySubledgerInboxService(database as never, costing as never);
    const productId = randomUUID();
    const body = receiptEnvelope({
      eventType: 'manufacturing.production.completed.v1',
      aggregateType: 'production_order',
      payload: {
        productionOrderId: randomUUID(),
        orderNumber: 'MO-00001',
        warehouseId: randomUUID(),
        finishedProductId: randomUUID(),
        inventoryReceiptId: randomUUID(),
        quantity: '5',
        orgUnitId: 'operating-unit-a',
        financeCostProfileId: FINANCE_PROFILE_ID,
        componentLines: [{ productId, uomId: randomUUID(), quantity: '2' }],
      },
    });
    await expect(inbox.receive(body, JSON.stringify(body), 'manufacturing')).resolves.toEqual({ status: 'PROCESSED' });
    expect(postInventoryTransferJournal).toHaveBeenCalledTimes(2);
  });
});
