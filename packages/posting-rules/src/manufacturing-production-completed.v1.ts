/** WI-OI-126 S7: WIP clearing when a production order completes (material standard cost → WIP clearing). */
export const MANUFACTURING_PRODUCTION_COMPLETED_EVENT_V1 = 'manufacturing.production.completed.v1' as const;

export const manufacturingProductionCompletedPostingPolicyV1 = {
  eventType: MANUFACTURING_PRODUCTION_COMPLETED_EVENT_V1,
  entryType: 'SUBLEDGER_INVENTORY' as const,
  sourceDocumentType: 'MANUFACTURING_PRODUCTION_ORDER' as const,
  sourceLineDocumentId(productionOrderId: string, productId: string): string {
    return `${productionOrderId}:wip:${productId}`;
  },
} as const;
