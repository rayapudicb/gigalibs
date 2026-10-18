import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { assertInventoryReceiptPostingReadyForClose } from './inventory-receipt-posting-close-guard.js';

describe('assertInventoryReceiptPostingReadyForClose', () => {
  it('passes when reconciliation is balanced', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('journal_id IS NULL')) return { rows: [] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '1' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        return { rows: [] };
      }),
    };
    await expect(
      assertInventoryReceiptPostingReadyForClose(client as never, 'gigalibs_finance', 'tenant-a'),
    ).resolves.toBeUndefined();
  });

  it('refuses close when inbox failures exist', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('journal_id IS NULL')) return { rows: [] };
        if (sql.includes("status = 'PROCESSED'")) return { rows: [{ count: '0' }] };
        if (sql.includes("status = 'FAILED'")) return { rows: [{ message_id: 'm1', last_error_code: 'X' }] };
        if (sql.includes("status = 'PROCESSING'")) return { rows: [{ count: '0' }] };
        return { rows: [] };
      }),
    };
    await expect(
      assertInventoryReceiptPostingReadyForClose(client as never, 'gigalibs_finance', 'tenant-a'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
