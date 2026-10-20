/** ADR-0033 D3 / WI-OI-120bq (M3): Inventory confirms zero undelivered receipt postings for a fiscal period. */
export const INVENTORY_POSTING_CUTOFF_V1 = 'inventory.posting-cutoff.v1' as const;

export const inventoryPostingCutoffV1 = {
  eventType: INVENTORY_POSTING_CUTOFF_V1,
  aggregateType: 'inventory_posting_cutoff' as const,
} as const;
