import { describe, expect, it } from 'vitest';
import {
  inventoryReceiptCompletedPostingPolicyV1,
  inventoryReceiptPostingDate,
} from './inventory-receipt-completed.v1.js';

describe('inventory receipt completed posting policy', () => {
  it('names the event, entry type and source document type', () => {
    expect(inventoryReceiptCompletedPostingPolicyV1.eventType).toBe('inventory.receipt.completed.v1');
    expect(inventoryReceiptCompletedPostingPolicyV1.entryType).toBe('SUBLEDGER_INVENTORY');
    expect(inventoryReceiptCompletedPostingPolicyV1.sourceDocumentType).toBe('INVENTORY_RECEIPT');
  });

  it('builds a stable line-level source document id', () => {
    expect(
      inventoryReceiptCompletedPostingPolicyV1.sourceLineDocumentId(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).toBe('11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222');
  });

  it('derives a calendar posting date from ISO timestamps', () => {
    expect(inventoryReceiptPostingDate('2026-10-18T14:30:00.000Z')).toBe('2026-10-18');
    expect(inventoryReceiptPostingDate('2026-10-18')).toBe('2026-10-18');
  });
});
