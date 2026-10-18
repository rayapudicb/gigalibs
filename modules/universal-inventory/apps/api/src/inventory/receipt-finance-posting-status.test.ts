import { describe, expect, it } from 'vitest';
import { resolveReceiptFinancePostingStatus } from './inventory.service.js';

describe('resolveReceiptFinancePostingStatus', () => {
  it('returns NOT_APPLICABLE for non-completed receipts', () => {
    expect(resolveReceiptFinancePostingStatus({ status: 'DRAFT' })).toBe('NOT_APPLICABLE');
  });

  it('prefers the persisted Finance status', () => {
    expect(
      resolveReceiptFinancePostingStatus({ status: 'COMPLETED', finance_posting_status: 'POSTED' }),
    ).toBe('POSTED');
  });

  it('falls back to outbox failure', () => {
    expect(
      resolveReceiptFinancePostingStatus({ status: 'COMPLETED', outbox_status: 'FAILED' }),
    ).toBe('POSTING_REJECTED');
  });
});
