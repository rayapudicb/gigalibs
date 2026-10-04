import { z } from 'zod';
import { CurrencyCodeSchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Fixed Assets Enums & Value Sets ──────────────────────────────────────────

export const DEPRECIATION_METHODS = [
  'STRAIGHT_LINE',
  'DECLINING_BALANCE',
  'SUM_OF_YEARS_DIGITS',
  'NO_DEPRECIATION',
] as const;
export const DepreciationMethodSchema = z.enum(DEPRECIATION_METHODS);
export type DepreciationMethod = z.infer<typeof DepreciationMethodSchema>;

export const DEPRECIATION_CONVENTIONS = [
  'FULL_MONTH',
  'HALF_YEAR',
  'MID_MONTH',
] as const;
export const DepreciationConventionSchema = z.enum(DEPRECIATION_CONVENTIONS);
export type DepreciationConvention = z.infer<typeof DepreciationConventionSchema>;

export const FIXED_ASSET_STATUSES = [
  'DRAFT',
  'CAPITALIZED',
  'DEPRECIATING',
  'FULLY_DEPRECIATED',
  'DISPOSED',
  'WRITTEN_OFF',
] as const;
export const FixedAssetStatusSchema = z.enum(FIXED_ASSET_STATUSES);
export type FixedAssetStatus = z.infer<typeof FixedAssetStatusSchema>;

export const DEPRECIATION_SCHEDULE_STATUSES = [
  'PROJECTED',
  'POSTED',
  'REVERSED',
] as const;
export const DepreciationScheduleStatusSchema = z.enum(DEPRECIATION_SCHEDULE_STATUSES);
export type DepreciationScheduleStatus = z.infer<typeof DepreciationScheduleStatusSchema>;

export const DEPRECIATION_RUN_STATUSES = ['DRAFT', 'POSTED'] as const;
export const DepreciationRunStatusSchema = z.enum(DEPRECIATION_RUN_STATUSES);
export type DepreciationRunStatus = z.infer<typeof DepreciationRunStatusSchema>;

export const ASSET_DISPOSAL_TYPES = [
  'SALE',
  'SCRAP',
  'WRITE_OFF',
  'THEFT',
] as const;
export const AssetDisposalTypeSchema = z.enum(ASSET_DISPOSAL_TYPES);
export type AssetDisposalType = z.infer<typeof AssetDisposalTypeSchema>;

// ─── Domain Entity Schemas ─────────────────────────────────────────────────────

export const FixedAssetClassV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional().nullable(),
    depreciationMethod: DepreciationMethodSchema,
    defaultUsefulLifeMonths: z.number().int().nonnegative(),
    defaultSalvagePercentage: z.number().int().min(0).max(100),
    assetGlAccountId: z.string().uuid(),
    depreciationExpenseGlAccountId: z.string().uuid(),
    accumulatedDepreciationGlAccountId: z.string().uuid(),
    disposalGainLossGlAccountId: z.string().uuid(),
    isActive: z.boolean(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type FixedAssetClassV1 = z.infer<typeof FixedAssetClassV1Schema>;

export const FixedAssetV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    assetCode: z.string().trim().min(1).max(50),
    assetName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    assetClassId: z.string().uuid(),
    status: FixedAssetStatusSchema,
    acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    capitalizationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    currencyCode: CurrencyCodeSchema,
    acquisitionCostMinor: MoneyMinorSchema,
    salvageValueMinor: MoneyMinorSchema,
    usefulLifeMonths: z.number().int().nonnegative(),
    depreciationMethod: DepreciationMethodSchema,
    convention: DepreciationConventionSchema,
    currentBookValueMinor: MoneyMinorSchema,
    accumulatedDepreciationMinor: MoneyMinorSchema,
    physicalAssetRef: z.string().uuid().optional().nullable(),
    assetTag: z.string().trim().max(100).optional().nullable(),
    serialNumber: z.string().trim().max(100).optional().nullable(),
    orgUnitId: z.string().trim().max(64).optional().nullable(),
    placeId: z.string().trim().max(64).optional().nullable(),
    custodianPartyId: z.string().uuid().optional().nullable(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().optional().nullable(),
    updatedBy: z.string().optional().nullable(),
  })
  .strict();
export type FixedAssetV1 = z.infer<typeof FixedAssetV1Schema>;

export const AssetDepreciationScheduleV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    assetId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    periodNumber: z.number().int().positive(),
    scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    depreciationAmountMinor: MoneyMinorSchema,
    accumulatedDepreciationMinor: MoneyMinorSchema,
    bookValueMinor: MoneyMinorSchema,
    status: DepreciationScheduleStatusSchema,
    journalEntryId: z.string().uuid().optional().nullable(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AssetDepreciationScheduleV1 = z.infer<typeof AssetDepreciationScheduleV1Schema>;

export const AssetDepreciationRunV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    runCode: z.string().trim().min(1).max(50),
    fiscalPeriodId: z.string().uuid(),
    runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalDepreciationAmountMinor: MoneyMinorSchema,
    assetCount: z.number().int().nonnegative(),
    journalEntryId: z.string().uuid().optional().nullable(),
    status: DepreciationRunStatusSchema,
    notes: z.string().trim().max(1000).optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AssetDepreciationRunV1 = z.infer<typeof AssetDepreciationRunV1Schema>;

export const AssetDisposalV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    assetId: z.string().uuid(),
    disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    disposalType: AssetDisposalTypeSchema,
    proceedsAmountMinor: MoneyMinorSchema,
    netBookValueMinor: MoneyMinorSchema,
    gainLossAmountMinor: MoneyMinorSchema,
    clearingBankAccountId: z.string().uuid().optional().nullable(),
    journalEntryId: z.string().uuid(),
    notes: z.string().trim().max(1000).optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AssetDisposalV1 = z.infer<typeof AssetDisposalV1Schema>;

// ─── Input DTO Schemas ─────────────────────────────────────────────────────────

export const CreateFixedAssetClassInputV1Schema = z
  .object({
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional().nullable(),
    depreciationMethod: DepreciationMethodSchema.default('STRAIGHT_LINE'),
    defaultUsefulLifeMonths: z.number().int().nonnegative(),
    defaultSalvagePercentage: z.number().int().min(0).max(100).default(0),
    assetGlAccountId: z.string().uuid(),
    depreciationExpenseGlAccountId: z.string().uuid(),
    accumulatedDepreciationGlAccountId: z.string().uuid(),
    disposalGainLossGlAccountId: z.string().uuid(),
  })
  .strict();
export type CreateFixedAssetClassInputV1 = z.infer<typeof CreateFixedAssetClassInputV1Schema>;

export const CreateFixedAssetInputV1Schema = z
  .object({
    assetCode: z.string().trim().min(1).max(50),
    assetName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    assetClassId: z.string().uuid(),
    acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    capitalizationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    currencyCode: CurrencyCodeSchema.default('USD'),
    acquisitionCostMinor: MoneyMinorSchema,
    salvageValueMinor: MoneyMinorSchema.default('0'),
    usefulLifeMonths: z.number().int().nonnegative().optional(),
    depreciationMethod: DepreciationMethodSchema.optional(),
    convention: DepreciationConventionSchema.default('FULL_MONTH'),
    physicalAssetRef: z.string().uuid().optional().nullable(),
    assetTag: z.string().trim().max(100).optional().nullable(),
    serialNumber: z.string().trim().max(100).optional().nullable(),
    orgUnitId: z.string().trim().max(64).optional().nullable(),
    placeId: z.string().trim().max(64).optional().nullable(),
    custodianPartyId: z.string().uuid().optional().nullable(),
  })
  .strict();
export type CreateFixedAssetInputV1 = z.infer<typeof CreateFixedAssetInputV1Schema>;

export const CapitalizeFixedAssetInputV1Schema = z
  .object({
    capitalizationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cipClearingGlAccountId: z.string().uuid().optional().nullable(),
  })
  .strict();
export type CapitalizeFixedAssetInputV1 = z.infer<typeof CapitalizeFixedAssetInputV1Schema>;

export const ExecuteDepreciationRunInputV1Schema = z
  .object({
    fiscalPeriodId: z.string().uuid(),
    runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();
export type ExecuteDepreciationRunInputV1 = z.infer<typeof ExecuteDepreciationRunInputV1Schema>;

export const DisposeFixedAssetInputV1Schema = z
  .object({
    disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    disposalType: AssetDisposalTypeSchema,
    proceedsAmountMinor: MoneyMinorSchema.default('0'),
    clearingBankAccountId: z.string().uuid().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();
export type DisposeFixedAssetInputV1 = z.infer<typeof DisposeFixedAssetInputV1Schema>;

// ─── CloudEvents Schemas ───────────────────────────────────────────────────────

const BaseEventSchema = z
  .object({
    id: z.string().uuid(),
    source: z.string().min(1),
    specversion: z.literal('1.0'),
    datacontenttype: z.literal('application/json'),
    time: z.string().datetime(),
    tenantid: z.string().min(1).max(64),
    correlationid: z.string().optional().nullable(),
  })
  .strict();

export const AssetCapitalizedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.asset.capitalized.v1'),
  data: z
    .object({
      assetId: z.string().uuid(),
      assetCode: z.string(),
      assetClassId: z.string().uuid(),
      acquisitionCostMinor: MoneyMinorSchema,
      capitalizationDate: z.string(),
    })
    .strict(),
}).strict();
export type AssetCapitalizedEventV1 = z.infer<typeof AssetCapitalizedEventV1Schema>;

export const DepreciationRunPostedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.depreciation.run.posted.v1'),
  data: z
    .object({
      runId: z.string().uuid(),
      runCode: z.string(),
      fiscalPeriodId: z.string().uuid(),
      totalDepreciationAmountMinor: MoneyMinorSchema,
      assetCount: z.number().int().nonnegative(),
      journalEntryId: z.string().uuid(),
    })
    .strict(),
}).strict();
export type DepreciationRunPostedEventV1 = z.infer<typeof DepreciationRunPostedEventV1Schema>;

export const AssetDisposedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.asset.disposed.v1'),
  data: z
    .object({
      assetId: z.string().uuid(),
      disposalId: z.string().uuid(),
      disposalType: AssetDisposalTypeSchema,
      proceedsAmountMinor: MoneyMinorSchema,
      netBookValueMinor: MoneyMinorSchema,
      gainLossAmountMinor: MoneyMinorSchema,
      journalEntryId: z.string().uuid(),
    })
    .strict(),
}).strict();
export type AssetDisposedEventV1 = z.infer<typeof AssetDisposedEventV1Schema>;

export type FixedAssetEventV1 =
  | AssetCapitalizedEventV1
  | DepreciationRunPostedEventV1
  | AssetDisposedEventV1;
