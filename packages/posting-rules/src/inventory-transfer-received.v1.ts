/** WI-OI-125 S2: posting policy when in-transit stock is received at the destination warehouse. */
export const INVENTORY_TRANSFER_RECEIVED_EVENT_V1 = 'inventory.transfer.received.v1' as const;

export const inventoryTransferReceivedPostingPolicyV1 = {
  eventType: INVENTORY_TRANSFER_RECEIVED_EVENT_V1,
  entryType: 'SUBLEDGER_INVENTORY' as const,
  sourceDocumentType: 'INVENTORY_TRANSFER_RECEIPT' as const,
  sourceLineDocumentId(transferId: string, productId: string): string {
    return `${transferId}:receive:${productId}`;
  },
} as const;
