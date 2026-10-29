/**
 * WI-OI-120bp: Finance → Inventory inbox (posting outcomes + fiscal period replica).
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { signRelayToken } from '@gigalibs/auth-core';
import {
  FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1,
  FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
  FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1,
  FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
} from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FinanceInventoryInboxService } from './finance-inbox.service.js';
import { InventoryRelayInboxGuard } from './inbox.guard.js';
import { INVENTORY_INBOX_AUDIENCE, loadInventoryFinanceInboxConfig } from './relay-config.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  return { publicBase64: publicKey.toString('base64'), privatePem: privateKey };
}

const inboxKeys = keyPair();
const config = loadInventoryFinanceInboxConfig({ INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64: inboxKeys.publicBase64 });
const TENANT = 'fintenant001';
const RECEIPT_ID = '550e8400-e29b-41d4-a716-446655440000';

function envelope(
  eventType: string,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    messageId: randomUUID(),
    tenantId: TENANT,
    eventType,
    aggregateType: eventType.includes('fiscal') ? 'FISCAL_PERIOD' : 'INVENTORY_RECEIPT',
    aggregateId: RECEIPT_ID,
    aggregateVersion: 1,
    correlationId: randomUUID(),
    causationId: null,
    schemaVersion: 1,
    payload,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function tokenFor(body: Record<string, unknown>, options: { audience?: string; source?: string; key?: string } = {}) {
  return signRelayToken(
    {
      audience: options.audience ?? INVENTORY_INBOX_AUDIENCE,
      source: options.source ?? 'finance',
      tenantId: body.tenantId as string,
      messageId: body.messageId as string,
      body: JSON.stringify(body),
    },
    options.key ?? inboxKeys.privatePem,
  );
}

function activate(guard: InventoryRelayInboxGuard, body: Record<string, unknown>, token: string) {
  const raw = JSON.stringify(body);
  const request = { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body: JSON.parse(raw) };
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);
}

describe('Inventory Finance relay inbox guard', () => {
  const guard = new InventoryRelayInboxGuard(config);

  it('accepts a Finance relay token for posting outcomes', () => {
    const body = envelope(FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1, {
      receiptId: RECEIPT_ID,
      status: 'POSTED',
    });
    expect(activate(guard, body, tokenFor(body))).toBe(true);
  });

  it('rejects a foreign audience or source', () => {
    const body = envelope(FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1, { receiptId: RECEIPT_ID, status: 'POSTED' });
    expect(() => activate(guard, body, tokenFor(body, { audience: 'other' }))).toThrow(/rejected/);
    expect(() => activate(guard, body, tokenFor(body, { source: 'inventory' }))).toThrow(/rejected/);
  });
});

const noopPostingCutoff = {
  tryPublishClearCutoffForReceiptDate: vi.fn(async () => undefined),
  tryPublishClearCutoffForPeriod: vi.fn(async () => undefined),
};

describe('FinanceInventoryInboxService', () => {
  function inboxWith(initialStatus: string | null) {
    const updates: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        if (sql.includes('SELECT finance_posting_status FROM')) {
          return { rows: initialStatus === null ? [] : [{ finance_posting_status: initialStatus }] };
        }
        if (sql.includes('UPDATE gigalibs_inventory.receipts')) {
          updates.push(params ?? []);
          return { rows: [{ completed_at: new Date().toISOString() }], rowCount: 1 };
        }
        if (sql.includes('finance_period_replica_meta') || sql.includes('finance_fiscal_period_replica')) {
          return { rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    return {
      inbox: new FinanceInventoryInboxService(database as never, noopPostingCutoff as never),
      client,
      updates,
    };
  }

  it('applies POSTED posting outcome to the receipt', async () => {
    const { inbox, updates } = inboxWith(null);
    const body = envelope(FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1, { receiptId: RECEIPT_ID, status: 'POSTED' });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(updates.some((params) => params?.[2] === 'POSTED')).toBe(true);
  });

  it('does not regress POSTED to POSTING_REJECTED', async () => {
    const { inbox, updates } = inboxWith('POSTED');
    const body = envelope(FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1, {
      receiptId: RECEIPT_ID,
      status: 'POSTING_REJECTED',
      rejectionCode: 'FINANCE_PERIOD_LOCKED',
    });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(updates).toHaveLength(0);
  });

  it('upserts fiscal period replica rows for primary book events', async () => {
    const inserts: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        inserts.push(sql);
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new FinanceInventoryInboxService(database as never, noopPostingCutoff as never);
    const periodId = randomUUID();
    const bookId = randomUUID();
    const body = envelope(
      FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
      {
        fiscalPeriodId: periodId,
        accountingBookId: bookId,
        periodName: '2026-10',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'OPEN',
        isPrimaryBook: true,
        stateVersion: 1,
      },
      { aggregateId: periodId },
    );
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(inserts.some((sql) => sql.includes('finance_fiscal_period_replica'))).toBe(true);
    expect(inserts.some((sql) => sql.includes('finance_period_replica_meta'))).toBe(true);
    expect(inserts.some((sql) => sql.includes('initial_sync_completed_at'))).toBe(false);
  });

  it('ignores stale period state when a newer stateVersion was already applied', async () => {
    const periodId = randomUUID();
    const bookId = randomUUID();
    const upsertRowCounts = [1, 0];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        if (sql.includes('finance_fiscal_period_replica')) {
          return { rowCount: upsertRowCounts.shift() ?? 0 };
        }
        return { rowCount: 1 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new FinanceInventoryInboxService(database as never, noopPostingCutoff as never);
    const locked = envelope(
      FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
      {
        fiscalPeriodId: periodId,
        accountingBookId: bookId,
        periodName: '2026-10',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'LOCKED',
        isPrimaryBook: true,
        stateVersion: 2,
      },
      { aggregateId: periodId, messageId: randomUUID() },
    );
    const staleOpen = envelope(
      FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
      {
        fiscalPeriodId: periodId,
        accountingBookId: bookId,
        periodName: '2026-10',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'OPEN',
        isPrimaryBook: true,
        stateVersion: 1,
      },
      { aggregateId: periodId, messageId: randomUUID() },
    );
    await inbox.receive(locked, JSON.stringify(locked));
    await inbox.receive(staleOpen, JSON.stringify(staleOpen));
    expect(upsertRowCounts).toHaveLength(0);
  });

  it('marks initial sync complete only on snapshot-completed', async () => {
    const inserts: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        inserts.push(sql);
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new FinanceInventoryInboxService(database as never, noopPostingCutoff as never);
    const bookId = randomUUID();
    const body = envelope(
      FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1,
      { primaryBookId: bookId, periodCount: 12 },
      { aggregateId: bookId, aggregateType: 'fiscal_period_snapshot' },
    );
    await inbox.receive(body, JSON.stringify(body));
    expect(inserts.some((sql) => sql.includes('initial_sync_completed_at'))).toBe(true);
  });

  it('projects landed cost adjustments onto receipt cost layers', async () => {
    const layerId = randomUUID();
    const productId = randomUUID();
    const landedCostId = randomUUID();
    const inserts: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        if (sql.includes('inventory_landed_cost_adjustments') && sql.includes('SELECT')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('inventory_receipt_cost_records')) {
          return { rows: [{ finance_cost_layer_id: layerId }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO gigalibs_inventory.inventory_landed_cost_adjustments')) {
          inserts.push(params ?? []);
          return { rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new FinanceInventoryInboxService(database as never, noopPostingCutoff as never);
    const body = envelope(
      FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1,
      {
        landedCostId,
        voucherNumber: 'LC-1',
        totalLandedCostMinor: '300000',
        adjustments: [
          {
            financeCostLayerId: layerId,
            productId,
            apportionedAmountMinor: '300000',
            priorUnitCostScaled: '1000000000',
            adjustedUnitCostScaled: '1006000000',
          },
        ],
      },
      { aggregateId: landedCostId, aggregateType: 'landed_cost' },
    );
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
    expect(inserts.length).toBe(1);
  });

  it('logs and acknowledges posting outcomes for unknown receipts', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO gigalibs_inventory.inbox_receipts')) {
          return { rows: [{ id: 'inbox-1' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_inventory.inbox_receipts')) {
          return { rowCount: 1 };
        }
        if (sql.includes('SELECT finance_posting_status')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE gigalibs_inventory.receipts')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_t: string, work: (c: typeof client) => unknown) => work(client)) };
    const inbox = new FinanceInventoryInboxService(database as never, noopPostingCutoff as never);
    const body = envelope(FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1, { receiptId: RECEIPT_ID, status: 'POSTED' });
    await expect(inbox.receive(body, JSON.stringify(body))).resolves.toEqual({ status: 'PROCESSED' });
  });
});
