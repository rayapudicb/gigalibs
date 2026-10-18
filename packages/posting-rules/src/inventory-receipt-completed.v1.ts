/** ADR-0033 D3 / plan v3 E2: posting policy for Inventory goods receipt completion. */
export const INVENTORY_RECEIPT_COMPLETED_EVENT_V1 = 'inventory.receipt.completed.v1' as const;

export const inventoryReceiptCompletedPostingPolicyV1 = {
  eventType: INVENTORY_RECEIPT_COMPLETED_EVENT_V1,
  /** GL entry type for subledger inventory receipts (Finance). */
  entryType: 'SUBLEDGER_INVENTORY' as const,
  /** One business document per receipt header. */
  sourceDocumentType: 'INVENTORY_RECEIPT' as const,
  /** Stable idempotency key per receipt line within the inbox consumer. */
  sourceLineDocumentId(receiptId: string, receiptLineId: string): string {
    return `${receiptId}:${receiptLineId}`;
  },
} as const;

/** Calendar posting date (YYYY-MM-DD) from the receipt's occurred/received timestamp. */
export function inventoryReceiptPostingDate(receivedAt: string): string {
  const trimmed = receivedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) throw new Error('The receipt timestamp is not a valid date.');
  return new Date(parsed).toISOString().slice(0, 10);
}
