/** WI-OI-125 S2: posting policy when stock leaves source ATP into in-transit (Finance subledger). */
export const INVENTORY_TRANSFER_DISPATCHED_EVENT_V1 = 'inventory.transfer.dispatched.v1' as const;

export const inventoryTransferDispatchedPostingPolicyV1 = {
  eventType: INVENTORY_TRANSFER_DISPATCHED_EVENT_V1,
  entryType: 'SUBLEDGER_INVENTORY' as const,
  sourceDocumentType: 'INVENTORY_TRANSFER_DISPATCH' as const,
  sourceLineDocumentId(transferId: string, productId: string): string {
    return `${transferId}:dispatch:${productId}`;
  },
} as const;
