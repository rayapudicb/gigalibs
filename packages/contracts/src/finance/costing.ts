import { z } from 'zod';
import { CurrencyCodeSchema, MoneyMinorSchema, DecimalQuantitySchema } from '../catalogue/index.js';
import { CostingMethodSchema } from './finance.js';

// ─── Costing Enums & Value Sets ─────────────────────────────────────────────


export const COST_LAYER_STATUSES = [
  'ACTIVE',
  'PARTIALLY_CONSUMED',
  'EXHAUSTED',
  'REVALUED',
] as const;
export const CostLayerStatusSchema = z.enum(COST_LAYER_STATUSES);
export type CostLayerStatus = z.infer<typeof CostLayerStatusSchema>;

export const LANDED_COST_ALLOCATION_BASES = [
  'VALUE',
  'WEIGHT',
  'VOLUME',
  'QUANTITY',
] as const;
export const LandedCostAllocationBasisSchema = z.enum(LANDED_COST_ALLOCATION_BASES);
export type LandedCostAllocationBasis = z.infer<typeof LandedCostAllocationBasisSchema>;

export const LANDED_COST_STATUSES = ['DRAFT', 'ALLOCATED', 'POSTED', 'VOIDED'] as const;
export const LandedCostStatusSchema = z.enum(LANDED_COST_STATUSES);
export type LandedCostStatus = z.infer<typeof LandedCostStatusSchema>;

export const REVALUATION_REASONS = [
  'LOWER_OF_COST_OR_NRV',
  'DAMAGED_OBSOLETE',
  'MARKET_CORRECTION',
  'PHYSICAL_COUNT_ADJUSTMENT',
] as const;
export const RevaluationReasonSchema = z.enum(REVALUATION_REASONS);
export type RevaluationReason = z.infer<typeof RevaluationReasonSchema>;

export const COST_TRANSACTION_TYPES = [
  'PURCHASE_RECEIPT',
  'CUSTOMER_SHIPMENT',
  'WORK_ORDER_ISSUE',
  'RETURN_INWARDS',
  'RETURN_OUTWARDS',
  'SCRAP_ADJUSTMENT',
  'REVALUATION',
] as const;
export const CostTransactionTypeSchema = z.enum(COST_TRANSACTION_TYPES);
export type CostTransactionType = z.infer<typeof CostTransactionTypeSchema>;

// Scaled unit cost schema (scaled by 1,000,000 for 6 decimal places, represented as string BigInt)
export const ScaledRateSchema = z.string().regex(/^\d+$/);

// ─── Domain Entity Schemas ─────────────────────────────────────────────────────

export const CostProfileV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    costingMethod: CostingMethodSchema,
    inventoryGlAccountId: z.string().uuid(),
    grniGlAccountId: z.string().uuid(),
    cogsGlAccountId: z.string().uuid(),
    landedCostClearingGlAccountId: z.string().uuid(),
    purchasePriceVarianceGlAccountId: z.string().uuid(),
    scrapGlAccountId: z.string().uuid(),
    valuationLossGlAccountId: z.string().uuid(),
    standardUnitCostScaled: ScaledRateSchema.optional().nullable(),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CostProfileV1 = z.infer<typeof CostProfileV1Schema>;

export const InventoryCostLayerV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    costProfileId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().min(1).max(64),
    receiptRef: z.string().min(1).max(100),
    receiptDate: z.string().datetime(),
    initialQuantity: DecimalQuantitySchema,
    remainingQuantity: DecimalQuantitySchema,
    unitCostScaled: ScaledRateSchema,
    totalInitialCostMinor: MoneyMinorSchema,
    totalRemainingCostMinor: MoneyMinorSchema,
    landedCostAddedMinor: MoneyMinorSchema.default('0'),
    status: CostLayerStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryCostLayerV1 = z.infer<typeof InventoryCostLayerV1Schema>;

export const CostLayerConsumptionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    costLayerId: z.string().uuid(),
    transactionRef: z.string().min(1).max(100),
    transactionType: CostTransactionTypeSchema,
    quantityConsumed: DecimalQuantitySchema,
    unitCostScaled: ScaledRateSchema,
    costMinor: MoneyMinorSchema,
    consumedAt: z.string().datetime(),
    glJournalId: z.string().uuid().optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type CostLayerConsumptionV1 = z.infer<typeof CostLayerConsumptionV1Schema>;

export const LandedCostV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    voucherNumber: z.string().min(1).max(50),
    description: z.string().max(1000).optional().nullable(),
    allocationBasis: LandedCostAllocationBasisSchema,
    totalLandedCostMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    status: LandedCostStatusSchema,
    glJournalId: z.string().uuid().optional().nullable(),
    postedAt: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type LandedCostV1 = z.infer<typeof LandedCostV1Schema>;

export const LandedCostAllocationLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    landedCostId: z.string().uuid(),
    costLayerId: z.string().uuid(),
    productId: z.string().uuid(),
    basisWeight: DecimalQuantitySchema,
    apportionedAmountMinor: MoneyMinorSchema,
    adjustedUnitCostScaled: ScaledRateSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type LandedCostAllocationLineV1 = z.infer<typeof LandedCostAllocationLineV1Schema>;

export const InventoryRevaluationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    warehouseId: z.string().min(1).max(64),
    revaluationDate: z.string().datetime(),
    reason: RevaluationReasonSchema,
    previousUnitCostScaled: ScaledRateSchema,
    newUnitCostScaled: ScaledRateSchema,
    quantity: DecimalQuantitySchema,
    carryingValueDeltaMinor: MoneyMinorSchema,
    glJournalId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type InventoryRevaluationV1 = z.infer<typeof InventoryRevaluationV1Schema>;

// ─── Input DTO Schemas ─────────────────────────────────────────────────────────

export const CreateCostProfileInputV1Schema = z
  .object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    costingMethod: CostingMethodSchema,
    inventoryGlAccountId: z.string().uuid(),
    grniGlAccountId: z.string().uuid(),
    cogsGlAccountId: z.string().uuid(),
    landedCostClearingGlAccountId: z.string().uuid(),
    purchasePriceVarianceGlAccountId: z.string().uuid(),
    scrapGlAccountId: z.string().uuid(),
    valuationLossGlAccountId: z.string().uuid(),
    standardUnitCostScaled: ScaledRateSchema.optional().nullable(),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();
export type CreateCostProfileInputV1 = z.infer<typeof CreateCostProfileInputV1Schema>;

export const IngestReceiptCostLayerInputV1Schema = z
  .object({
    costProfileId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().min(1).max(64),
    receiptRef: z.string().min(1).max(100),
    receiptDate: z.string().datetime(),
    quantity: DecimalQuantitySchema,
    unitCostScaled: ScaledRateSchema,
    postGlJournal: z.boolean().default(true),
    bookId: z.string().uuid().optional(),
    periodId: z.string().uuid().optional(),
    sourceDocumentType: z.string().min(1).max(64).optional(),
    sourceDocumentId: z.string().min(1).max(128).optional(),
    journalEntryType: z.string().min(1).max(64).optional(),
  })
  .strict();
export type IngestReceiptCostLayerInputV1 = z.infer<typeof IngestReceiptCostLayerInputV1Schema>;

export const RecordShipmentCostInputV1Schema = z
  .object({
    costProfileId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().min(1).max(64),
    transactionRef: z.string().min(1).max(100),
    quantity: DecimalQuantitySchema,
    transactionType: CostTransactionTypeSchema.default('CUSTOMER_SHIPMENT'),
    postGlJournal: z.boolean().default(true),
    bookId: z.string().uuid().optional(),
    periodId: z.string().uuid().optional(),
  })
  .strict();
export type RecordShipmentCostInputV1 = z.infer<typeof RecordShipmentCostInputV1Schema>;

export const CreateLandedCostInputV1Schema = z
  .object({
    voucherNumber: z.string().min(1).max(50),
    description: z.string().max(1000).optional().nullable(),
    allocationBasis: LandedCostAllocationBasisSchema,
    totalLandedCostMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    receiptLayerAllocations: z
      .array(
        z.object({
          costLayerId: z.string().uuid(),
          basisMetric: DecimalQuantitySchema,
        }),
      )
      .min(1),
    postGlJournal: z.boolean().default(true),
    bookId: z.string().uuid().optional(),
    periodId: z.string().uuid().optional(),
  })
  .strict();
export type CreateLandedCostInputV1 = z.infer<typeof CreateLandedCostInputV1Schema>;

export const ExecuteRevaluationInputV1Schema = z
  .object({
    costProfileId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().min(1).max(64),
    reason: RevaluationReasonSchema,
    newUnitCostScaled: ScaledRateSchema,
    bookId: z.string().uuid(),
    periodId: z.string().uuid(),
    revaluationDate: z.string().datetime().optional(),
  })
  .strict();
export type ExecuteRevaluationInputV1 = z.infer<typeof ExecuteRevaluationInputV1Schema>;

// ─── Reporting & Analytics DTOs ───────────────────────────────────────────────

export const InventoryValuationSummaryV1Schema = z
  .object({
    productId: z.string().uuid(),
    productCode: z.string(),
    warehouseId: z.string(),
    totalQuantity: DecimalQuantitySchema,
    effectiveAverageCostScaled: ScaledRateSchema,
    totalValuationMinor: MoneyMinorSchema,
    costingMethod: CostingMethodSchema,
    activeLayerCount: z.number().int().nonnegative(),
  })
  .strict();
export type InventoryValuationSummaryV1 = z.infer<typeof InventoryValuationSummaryV1Schema>;

export const GrossMarginAnalysisV1Schema = z
  .object({
    transactionRef: z.string(),
    productId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    revenueMinor: MoneyMinorSchema,
    cogsMinor: MoneyMinorSchema,
    grossMarginMinor: MoneyMinorSchema,
    marginPercentageScaled: ScaledRateSchema,
  })
  .strict();
export type GrossMarginAnalysisV1 = z.infer<typeof GrossMarginAnalysisV1Schema>;

// ─── Outbox CloudEvents ────────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  id: z.string().uuid(),
  source: z.literal('gigalibs.financial-operations.costing'),
  specversion: z.literal('1.0'),
  datacontenttype: z.literal('application/json'),
  time: z.string().datetime(),
  tenantId: z.string().min(1).max(64),
});

export const CostProfileCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.costing.profile.created.v1'),
  data: z
    .object({
      costProfileId: z.string().uuid(),
      code: z.string(),
      costingMethod: CostingMethodSchema,
    })
    .strict(),
}).strict();
export type CostProfileCreatedEventV1 = z.infer<typeof CostProfileCreatedEventV1Schema>;

export const CostLayerCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.costing.layer.created.v1'),
  data: z
    .object({
      costLayerId: z.string().uuid(),
      productId: z.string().uuid(),
      warehouseId: z.string(),
      quantity: DecimalQuantitySchema,
      unitCostScaled: ScaledRateSchema,
      totalCostMinor: MoneyMinorSchema,
    })
    .strict(),
}).strict();
export type CostLayerCreatedEventV1 = z.infer<typeof CostLayerCreatedEventV1Schema>;

export const CogsPostedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.costing.cogs.posted.v1'),
  data: z
    .object({
      transactionRef: z.string(),
      productId: z.string().uuid(),
      quantity: DecimalQuantitySchema,
      totalCogsMinor: MoneyMinorSchema,
      glJournalId: z.string().uuid().optional().nullable(),
    })
    .strict(),
}).strict();
export type CogsPostedEventV1 = z.infer<typeof CogsPostedEventV1Schema>;

export const LandedCostPostedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.costing.landed_cost.posted.v1'),
  data: z
    .object({
      landedCostId: z.string().uuid(),
      voucherNumber: z.string(),
      totalLandedCostMinor: MoneyMinorSchema,
      allocatedLayersCount: z.number().int().positive(),
      glJournalId: z.string().uuid().optional().nullable(),
    })
    .strict(),
}).strict();
export type LandedCostPostedEventV1 = z.infer<typeof LandedCostPostedEventV1Schema>;

export const InventoryRevaluationPostedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.costing.revaluation.posted.v1'),
  data: z
    .object({
      revaluationId: z.string().uuid(),
      productId: z.string().uuid(),
      deltaMinor: MoneyMinorSchema,
      glJournalId: z.string().uuid(),
    })
    .strict(),
}).strict();
export type InventoryRevaluationPostedEventV1 = z.infer<typeof InventoryRevaluationPostedEventV1Schema>;

export type CostingEventV1 =
  | CostProfileCreatedEventV1
  | CostLayerCreatedEventV1
  | CogsPostedEventV1
  | LandedCostPostedEventV1
  | InventoryRevaluationPostedEventV1;
