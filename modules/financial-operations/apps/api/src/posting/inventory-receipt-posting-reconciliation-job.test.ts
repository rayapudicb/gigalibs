import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { describe, expect, it, vi } from 'vitest';
import {
  loadInventoryReceiptPostingReconciliationJobConfig,
  runInventoryReceiptPostingReconciliationSweep,
} from './inventory-receipt-posting-reconciliation-job.js';

describe('loadInventoryReceiptPostingReconciliationJobConfig', () => {
  it('disables when FINANCE_INVENTORY_POSTING_RECONCILIATION_DISABLED is set', () => {
    expect(
      loadInventoryReceiptPostingReconciliationJobConfig({
        FINANCE_INVENTORY_POSTING_RECONCILIATION_DISABLED: 'true',
      }).enabled,
    ).toBe(false);
  });

  it('uses a minimum interval of one minute', () => {
    expect(
      loadInventoryReceiptPostingReconciliationJobConfig({
        FINANCE_INVENTORY_POSTING_RECONCILIATION_INTERVAL_MS: '1000',
      }).intervalMs,
    ).toBe(86_400_000);
  });
});

describe('runInventoryReceiptPostingReconciliationSweep', () => {
  it('writes an audit event when a tenant is not balanced', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('audit_events')) return { rows: [] };
      if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '1' }] };
      if (sql.includes("status = 'FAILED'")) return { rows: [{ message_id: 'm1', last_error_code: 'X' }] };
      if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
      if (sql.includes('journal_id IS NULL')) return { rows: [] };
      return { rows: [] };
    });
    const database = {
      relayCall: vi.fn(async () => [{ tenant_id: 'tenant-a' }]),
      withTenantTransaction: vi.fn(async (_tenantId: string, operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
      ),
    };

    const result = await runInventoryReceiptPostingReconciliationSweep(database as never, {
      enabled: true,
      intervalMs: 60_000,
    });

    expect(result).toEqual({ tenantsChecked: 1, unbalancedTenants: 1 });
    expect(database.relayCall).toHaveBeenCalledWith('list_inventory_receipt_posting_reconciliation_tenants', [
      'finance.inventory-subledger',
      inventoryReceiptCompletedPostingPolicyV1.eventType,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('audit_events'), expect.any(Array));
  });

  it('skips work when disabled', async () => {
    const database = { relayCall: vi.fn(), withTenantTransaction: vi.fn() };
    await expect(
      runInventoryReceiptPostingReconciliationSweep(database as never, { enabled: false, intervalMs: 60_000 }),
    ).resolves.toEqual({ tenantsChecked: 0, unbalancedTenants: 0 });
    expect(database.relayCall).not.toHaveBeenCalled();
  });
});
