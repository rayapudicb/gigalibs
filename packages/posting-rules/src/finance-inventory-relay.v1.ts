/** ADR-0033 D3 / WI-OI-120bp: Finance → Inventory relay payloads. */
export const FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1 =
  'finance.inventory-receipt.posting-outcome.v1' as const;

export const FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1 =
  'finance.fiscal-period.state-changed.v1' as const;

export type FinanceInventoryReceiptPostingOutcomeStatus = 'POSTED' | 'POSTING_REJECTED';

export const financeInventoryReceiptPostingOutcomeV1 = {
  eventType: FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
  aggregateType: 'inventory_receipt' as const,
} as const;

export const financeFiscalPeriodStateChangedV1 = {
  eventType: FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
  aggregateType: 'fiscal_period' as const,
} as const;
