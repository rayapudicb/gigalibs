import { describe, expect, it, vi } from 'vitest';
import { listInventoryReceiptJournalGaps, recordInventoryReceiptLinePosting } from './subledger-posting-register.js';

describe('subledger posting register', () => {
  it('records a register row with the linked journal id when found', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM gigalibs_finance.gl_journals')) return { rows: [{ id: 'journal-1' }] };
        return { rows: [], rowCount: 1 };
      }),
    };

    await recordInventoryReceiptLinePosting(client as never, 'gigalibs_finance', {
      tenantId: 'tenant-a',
      messageId: 'msg-1',
      sourceDocumentId: 'receipt:line-1',
      journalEntryType: 'SUBLEDGER_INVENTORY',
    });

    expect(statements.some((sql) => sql.includes('subledger_posting_register'))).toBe(true);
  });

  it('lists source document ids missing a journal link', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{ source_document_id: 'a:b' }],
      })),
    };
    await expect(listInventoryReceiptJournalGaps(client as never, 'gigalibs_finance', 'tenant-a')).resolves.toEqual([
      'a:b',
    ]);
  });
});
