import { z } from 'zod';

/** Finance → Inventory relay event types (ADR-0033 D3 / WI-OI-120bp). */
export const FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1 =
  'finance.inventory-receipt.posting-outcome.v1' as const;

export const FINANCE_FISCAL_PERIOD_STATE_CHANGED_V1 =
  'finance.fiscal-period.state-changed.v1' as const;

export const FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1 =
  'finance.fiscal-period.snapshot-completed.v1' as const;

export const FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1 =
  'finance.inventory.landed-cost-adjusted.v1' as const;

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

export const financeInventoryLandedCostAdjustedV1 = {
  eventType: FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1,
  aggregateType: 'landed_cost' as const,
} as const;

/** Authoritative Finance valuation for one Inventory receipt line. */
export const FinanceInventoryReceiptCostLineV1Schema = z.object({
  receiptLineId: z.string().uuid(),
  financeCostLayerId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/),
  valuationMethod: z.enum(['STANDARD', 'FIFO', 'AVERAGE']),
  unitCostScaled: z.string().regex(/^\d+$/),
  totalCostMinor: z.string().regex(/^\d+$/),
}).strict();
export type FinanceInventoryReceiptCostLineV1 = z.infer<typeof FinanceInventoryReceiptCostLineV1Schema>;

export const FinanceInventoryReceiptPostingOutcomePayloadSchema = z
  .object({
    receiptId: z.string().uuid(),
    status: z.enum(['POSTED', 'POSTING_REJECTED']),
    rejectionCode: z.string().optional(),
    /** Additive for older posting outcomes; absence leaves the cost projection pending. */
    costLines: z.array(FinanceInventoryReceiptCostLineV1Schema).optional(),
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

export const FinanceInventoryLandedCostAdjustmentLineV1Schema = z
  .object({
    financeCostLayerId: z.string().uuid(),
    productId: z.string().uuid(),
    apportionedAmountMinor: z.string().regex(/^\d+$/),
    priorUnitCostScaled: z.string().regex(/^\d+$/),
    adjustedUnitCostScaled: z.string().regex(/^\d+$/),
  })
  .strict();
export type FinanceInventoryLandedCostAdjustmentLineV1 = z.infer<
  typeof FinanceInventoryLandedCostAdjustmentLineV1Schema
>;

export const FinanceInventoryLandedCostAdjustedPayloadSchema = z
  .object({
    landedCostId: z.string().uuid(),
    voucherNumber: z.string().min(1).max(50),
    totalLandedCostMinor: z.string().regex(/^\d+$/),
    adjustments: z.array(FinanceInventoryLandedCostAdjustmentLineV1Schema).min(1),
  })
  .strict();
export type FinanceInventoryLandedCostAdjustedPayloadV1 = z.infer<
  typeof FinanceInventoryLandedCostAdjustedPayloadSchema
>;
