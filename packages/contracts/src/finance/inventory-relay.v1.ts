import { z } from 'zod';

/** Finance → Inventory relay event types (ADR-0033 D3 / WI-OI-120bp). */
export const FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1 =
  'finance.inventory-receipt.posting-outcome.v1' as const;

export const FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1 =
  'finance.fiscal-period.state-changed.v1' as const;

export const FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1 =
  'finance.fiscal-period.snapshot-completed.v1' as const;

export type FinanceInventoryReceiptPostingOutcomeStatus = 'POSTED' | 'POSTING_REJECTED';

export const financeInventoryReceiptPostingOutcomeV1 = {
  eventType: FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
  aggregateType: 'inventory_receipt' as const,
} as const;

export const financeFiscalPeriodStateChangedV1 = {
  eventType: FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1,
  aggregateType: 'fiscal_period' as const,
} as const;

export const financeFiscalPeriodSnapshotCompletedV1 = {
  eventType: FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1,
  aggregateType: 'fiscal_period_snapshot' as const,
} as const;

export const FinanceInventoryReceiptPostingOutcomePayloadSchema = z
  .object({
    receiptId: z.string().uuid(),
    status: z.enum(['POSTED', 'POSTING_REJECTED']),
    rejectionCode: z.string().optional(),
  })
  .strict();

export const FinanceFiscalPeriodStateChangedPayloadSchema = z
  .object({
    fiscalPeriodId: z.string().uuid(),
    accountingBookId: z.string().uuid(),
    periodName: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    status: z.string(),
    isPrimaryBook: z.boolean(),
    stateVersion: z.number().int().positive(),
  })
  .strict();

export const FinanceFiscalPeriodSnapshotCompletedPayloadSchema = z
  .object({
    primaryBookId: z.string().uuid(),
    periodCount: z.number().int().nonnegative(),
  })
  .strict();
