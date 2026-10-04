import { z } from 'zod';
import { CurrencyCodeSchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Consolidation Enums & Value Sets ─────────────────────────────────────────

export const CONSOLIDATION_METHODS = ['FULL', 'PROPORTIONAL', 'EQUITY'] as const;
export const ConsolidationMethodSchema = z.enum(CONSOLIDATION_METHODS);
export type ConsolidationMethod = z.infer<typeof ConsolidationMethodSchema>;

export const CONSOLIDATION_RUN_STATUSES = [
  'DRAFT',
  'TRANSLATED',
  'ELIMINATED',
  'SEALED',
  'REVERSED',
] as const;
export const ConsolidationRunStatusSchema = z.enum(CONSOLIDATION_RUN_STATUSES);
export type ConsolidationRunStatus = z.infer<typeof ConsolidationRunStatusSchema>;

export const FX_RATE_TYPES = [
  'CLOSING',
  'AVERAGE',
  'HISTORICAL',
  'ONE_TO_ONE',
] as const;
export const FxRateTypeSchema = z.enum(FX_RATE_TYPES);
export type FxRateType = z.infer<typeof FxRateTypeSchema>;

export const INTERCOMPANY_PAIR_TYPES = [
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
  'DIVIDEND',
] as const;
export const IntercompanyPairTypeSchema = z.enum(INTERCOMPANY_PAIR_TYPES);
export type IntercompanyPairType = z.infer<typeof IntercompanyPairTypeSchema>;

export const ELIMINATION_TARGET_TYPES = ['BILATERAL', 'UNILATERAL'] as const;
export const EliminationTargetTypeSchema = z.enum(ELIMINATION_TARGET_TYPES);
export type EliminationTargetType = z.infer<typeof EliminationTargetTypeSchema>;

// Scaled rate schema (scaled by 1,000,000 for 6 decimal places, represented as string BigInt)
export const ScaledFxRateSchema = z.string().regex(/^\d+$/);

// ─── Domain Entity Schemas ─────────────────────────────────────────────────────

export const ConsolidationGroupV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    reportingCurrency: CurrencyCodeSchema,
    parentEntityId: z.string().uuid(),
    ctaGlAccountId: z.string().uuid(),
    nciGlAccountId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().default(true),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional().nullable(),
    updatedBy: z.string().max(64).optional().nullable(),
  })
  .strict();
export type ConsolidationGroupV1 = z.infer<typeof ConsolidationGroupV1Schema>;

export const ConsolidationEntityV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationGroupId: z.string().uuid(),
    bookId: z.string().uuid(),
    ownershipPercentage: z.number().int().min(1).max(100).default(100),
    consolidationMethod: ConsolidationMethodSchema.default('FULL'),
    isParent: z.boolean().default(false),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ConsolidationEntityV1 = z.infer<typeof ConsolidationEntityV1Schema>;

export const ConsolidationFxRateV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationGroupId: z.string().uuid(),
    fiscalYearId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    fromCurrency: CurrencyCodeSchema,
    toCurrency: CurrencyCodeSchema,
    closingRateScaled: ScaledFxRateSchema,
    averageRateScaled: ScaledFxRateSchema,
    historicalRateScaled: ScaledFxRateSchema,
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ConsolidationFxRateV1 = z.infer<typeof ConsolidationFxRateV1Schema>;

export const IntercompanyPairV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationGroupId: z.string().uuid(),
    code: z.string().min(1).max(50),
    entityABookId: z.string().uuid(),
    entityAGlAccountId: z.string().uuid(),
    entityBBookId: z.string().uuid(),
    entityBGlAccountId: z.string().uuid(),
    pairType: IntercompanyPairTypeSchema.default('BALANCE_SHEET'),
    eliminationTarget: EliminationTargetTypeSchema.default('BILATERAL'),
    isActive: z.boolean().default(true),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type IntercompanyPairV1 = z.infer<typeof IntercompanyPairV1Schema>;

export const ConsolidationRunV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationGroupId: z.string().uuid(),
    runNumber: z.string().min(1).max(50),
    fiscalYearId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    status: ConsolidationRunStatusSchema.default('DRAFT'),
    totalSubsidiaryDebitMinor: MoneyMinorSchema.default('0'),
    totalSubsidiaryCreditMinor: MoneyMinorSchema.default('0'),
    totalEliminationDebitMinor: MoneyMinorSchema.default('0'),
    totalEliminationCreditMinor: MoneyMinorSchema.default('0'),
    totalCtaMinor: MoneyMinorSchema.default('0'),
    totalConsolidatedDebitMinor: MoneyMinorSchema.default('0'),
    totalConsolidatedCreditMinor: MoneyMinorSchema.default('0'),
    executedBy: z.string().min(1).max(64),
    executedAt: z.string().datetime(),
    sealedAt: z.string().datetime().optional().nullable(),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ConsolidationRunV1 = z.infer<typeof ConsolidationRunV1Schema>;

export const ConsolidationEntryV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationRunId: z.string().uuid(),
    bookId: z.string().uuid(),
    glAccountId: z.string().uuid(),
    localCurrency: CurrencyCodeSchema,
    localDebitMinor: MoneyMinorSchema.default('0'),
    localCreditMinor: MoneyMinorSchema.default('0'),
    fxRateType: FxRateTypeSchema,
    fxRateAppliedScaled: ScaledFxRateSchema,
    reportingCurrency: CurrencyCodeSchema,
    reportingDebitMinor: MoneyMinorSchema.default('0'),
    reportingCreditMinor: MoneyMinorSchema.default('0'),
  })
  .strict();
export type ConsolidationEntryV1 = z.infer<typeof ConsolidationEntryV1Schema>;

export const ConsolidationEliminationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    consolidationRunId: z.string().uuid(),
    intercompanyPairId: z.string().uuid().optional().nullable(),
    glJournalId: z.string().uuid().optional().nullable(),
    debitGlAccountId: z.string().uuid(),
    creditGlAccountId: z.string().uuid(),
    eliminationAmountMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    discrepancyAmountMinor: MoneyMinorSchema.default('0'),
    description: z.string().min(1).max(1000),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ConsolidationEliminationV1 = z.infer<typeof ConsolidationEliminationV1Schema>;

// ─── Input DTO Schemas ─────────────────────────────────────────────────────────

export const CreateConsolidationGroupInputV1Schema = z
  .object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    reportingCurrency: CurrencyCodeSchema,
    parentEntityId: z.string().uuid(),
    ctaGlAccountId: z.string().uuid(),
    nciGlAccountId: z.string().uuid().optional().nullable(),
  })
  .strict();
export type CreateConsolidationGroupInputV1 = z.infer<
  typeof CreateConsolidationGroupInputV1Schema
>;

export const AddConsolidationEntityInputV1Schema = z
  .object({
    bookId: z.string().uuid(),
    ownershipPercentage: z.number().int().min(1).max(100).default(100),
    consolidationMethod: ConsolidationMethodSchema.default('FULL'),
    isParent: z.boolean().default(false),
  })
  .strict();
export type AddConsolidationEntityInputV1 = z.infer<
  typeof AddConsolidationEntityInputV1Schema
>;

export const SetConsolidationFxRateInputV1Schema = z
  .object({
    fiscalYearId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    fromCurrency: CurrencyCodeSchema,
    toCurrency: CurrencyCodeSchema,
    closingRateScaled: ScaledFxRateSchema,
    averageRateScaled: ScaledFxRateSchema,
    historicalRateScaled: ScaledFxRateSchema,
  })
  .strict();
export type SetConsolidationFxRateInputV1 = z.infer<
  typeof SetConsolidationFxRateInputV1Schema
>;

export const CreateIntercompanyPairInputV1Schema = z
  .object({
    code: z.string().min(1).max(50),
    entityABookId: z.string().uuid(),
    entityAGlAccountId: z.string().uuid(),
    entityBBookId: z.string().uuid(),
    entityBGlAccountId: z.string().uuid(),
    pairType: IntercompanyPairTypeSchema.default('BALANCE_SHEET'),
    eliminationTarget: EliminationTargetTypeSchema.default('BILATERAL'),
  })
  .strict();
export type CreateIntercompanyPairInputV1 = z.infer<
  typeof CreateIntercompanyPairInputV1Schema
>;

export const ExecuteConsolidationRunInputV1Schema = z
  .object({
    consolidationGroupId: z.string().uuid(),
    fiscalYearId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    executedBy: z.string().min(1).max(64),
    postEliminationJournals: z.boolean().default(true),
  })
  .strict();
export type ExecuteConsolidationRunInputV1 = z.infer<
  typeof ExecuteConsolidationRunInputV1Schema
>;

// ─── Reporting & Read Model Schemas ───────────────────────────────────────────

export const ConsolidatedTrialBalanceRowV1Schema = z
  .object({
    glAccountId: z.string().uuid(),
    accountCode: z.string(),
    accountName: z.string(),
    accountType: z.string(),
    subsidiaryDebitMinor: MoneyMinorSchema,
    subsidiaryCreditMinor: MoneyMinorSchema,
    eliminationDebitMinor: MoneyMinorSchema,
    eliminationCreditMinor: MoneyMinorSchema,
    ctaAdjustmentMinor: MoneyMinorSchema,
    consolidatedDebitMinor: MoneyMinorSchema,
    consolidatedCreditMinor: MoneyMinorSchema,
    netConsolidatedBalanceMinor: MoneyMinorSchema,
  })
  .strict();
export type ConsolidatedTrialBalanceRowV1 = z.infer<
  typeof ConsolidatedTrialBalanceRowV1Schema
>;

export const ConsolidatedStatementV1Schema = z
  .object({
    consolidationRunId: z.string().uuid(),
    groupCode: z.string(),
    reportingCurrency: CurrencyCodeSchema,
    fiscalPeriodId: z.string().uuid(),
    status: ConsolidationRunStatusSchema,
    rows: z.array(ConsolidatedTrialBalanceRowV1Schema),
    totalAssetsMinor: MoneyMinorSchema,
    totalLiabilitiesMinor: MoneyMinorSchema,
    totalEquityMinor: MoneyMinorSchema,
    totalRevenueMinor: MoneyMinorSchema,
    totalExpenseMinor: MoneyMinorSchema,
    netIncomeMinor: MoneyMinorSchema,
    totalCtaMinor: MoneyMinorSchema,
    isBalanced: z.boolean(),
  })
  .strict();
export type ConsolidatedStatementV1 = z.infer<
  typeof ConsolidatedStatementV1Schema
>;

// ─── CloudEvents ──────────────────────────────────────────────────────────────

export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  occurredAt: z.string().datetime(),
  producer: z.string(),
});

export const ConsolidationGroupCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.consolidation.group.created.v1'),
  data: z.object({
    groupId: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    reportingCurrency: CurrencyCodeSchema,
    parentEntityId: z.string().uuid(),
  }),
}).strict();
export type ConsolidationGroupCreatedEventV1 = z.infer<
  typeof ConsolidationGroupCreatedEventV1Schema
>;

export const ConsolidationRunExecutedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.consolidation.run.executed.v1'),
  data: z.object({
    runId: z.string().uuid(),
    runNumber: z.string(),
    groupId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    totalConsolidatedDebitMinor: MoneyMinorSchema,
    totalConsolidatedCreditMinor: MoneyMinorSchema,
    totalCtaMinor: MoneyMinorSchema,
    executedBy: z.string(),
  }),
}).strict();
export type ConsolidationRunExecutedEventV1 = z.infer<
  typeof ConsolidationRunExecutedEventV1Schema
>;

export const ConsolidationRunSealedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.consolidation.run.sealed.v1'),
  data: z.object({
    runId: z.string().uuid(),
    runNumber: z.string(),
    groupId: z.string().uuid(),
    sealedAt: z.string().datetime(),
  }),
}).strict();
export type ConsolidationRunSealedEventV1 = z.infer<
  typeof ConsolidationRunSealedEventV1Schema
>;

export type ConsolidationEventV1 =
  | ConsolidationGroupCreatedEventV1
  | ConsolidationRunExecutedEventV1
  | ConsolidationRunSealedEventV1;
