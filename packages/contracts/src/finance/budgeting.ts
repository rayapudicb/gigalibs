import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';

// ─── Budgeting Enums & Value Sets ─────────────────────────────────────────────

export const BUDGET_TYPES = [
  'OPERATING_OPEX',
  'CAPITAL_CAPEX',
  'PROJECT',
  'REVENUE',
] as const;
export const BudgetTypeSchema = z.enum(BUDGET_TYPES);
export type BudgetType = z.infer<typeof BudgetTypeSchema>;

export const BUDGET_REVISION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'ACTIVE',
  'REVISED',
  'SUPERSEDED',
  'FROZEN',
  'CLOSED',
] as const;
export const BudgetRevisionStatusSchema = z.enum(BUDGET_REVISION_STATUSES);
export type BudgetRevisionStatus = z.infer<typeof BudgetRevisionStatusSchema>;

export const BUDGET_CONTROL_ACTIONS = [
  'HARD_STOP',
  'ADVISORY_WARN',
  'AUDIT_LOG',
  'DISABLED',
] as const;
export const BudgetControlActionSchema = z.enum(BUDGET_CONTROL_ACTIONS);
export type BudgetControlAction = z.infer<typeof BudgetControlActionSchema>;

export const COMMITMENT_TYPES = [
  'PRE_COMMITMENT',
  'ENCUMBRANCE',
  'ACTUAL_CONSUMPTION',
  'RELEASE',
] as const;
export const CommitmentTypeSchema = z.enum(COMMITMENT_TYPES);
export type CommitmentType = z.infer<typeof CommitmentTypeSchema>;

export const COMMITMENT_STATUSES = [
  'ACTIVE',
  'LIQUIDATED',
  'CANCELLED',
] as const;
export const CommitmentStatusSchema = z.enum(COMMITMENT_STATUSES);
export type CommitmentStatus = z.infer<typeof CommitmentStatusSchema>;

export const BUDGET_SOURCE_DOCUMENT_TYPES = [
  'PURCHASE_REQUISITION',
  'PURCHASE_ORDER',
  'AP_BILL',
  'MANUAL_RESERVATION',
] as const;
export const BudgetSourceDocumentTypeSchema = z.enum(BUDGET_SOURCE_DOCUMENT_TYPES);
export type BudgetSourceDocumentType = z.infer<typeof BudgetSourceDocumentTypeSchema>;

export const PERIOD_DISTRIBUTION_METHODS = [
  'EQUAL_MONTHLY',
  'QUARTERLY',
  'SEASONAL_WEIGHTED',
  'CUSTOM_PERIODIC',
] as const;
export const PeriodDistributionMethodSchema = z.enum(PERIOD_DISTRIBUTION_METHODS);
export type PeriodDistributionMethod = z.infer<typeof PeriodDistributionMethodSchema>;

// ─── Domain Entity Schemas ─────────────────────────────────────────────────────

export const BudgetStructureV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    budgetType: BudgetTypeSchema,
    accountingBookId: z.string().uuid(),
    controlAction: BudgetControlActionSchema,
    allowOverspendThresholdPct: z.number().min(0).max(100).default(0),
    isActive: z.boolean().default(true),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional().nullable(),
    updatedBy: z.string().max(64).optional().nullable(),
  })
  .strict();
export type BudgetStructureV1 = z.infer<typeof BudgetStructureV1Schema>;

export const BudgetRevisionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    budgetStructureId: z.string().uuid(),
    revisionNumber: z.number().int().min(1),
    fiscalYearId: z.string().uuid(),
    status: BudgetRevisionStatusSchema,
    totalAllocatedMinor: MoneyMinorSchema,
    checksum: z.string().length(64).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    submittedAt: z.string().datetime().optional().nullable(),
    submittedBy: z.string().max(64).optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    approvedBy: z.string().max(64).optional().nullable(),
    activatedAt: z.string().datetime().optional().nullable(),
    activatedBy: z.string().max(64).optional().nullable(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BudgetRevisionV1 = z.infer<typeof BudgetRevisionV1Schema>;

export const BudgetLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    budgetRevisionId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    accountId: z.string().uuid(),
    costCenterId: z.string().max(64),
    projectCode: z.string().max(64).optional().nullable(),
    allocatedAmountMinor: MoneyMinorSchema,
    revisedAmountMinor: MoneyMinorSchema.optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BudgetLineV1 = z.infer<typeof BudgetLineV1Schema>;

export const BudgetCommitmentV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    budgetLineId: z.string().uuid(),
    sourceDocumentType: BudgetSourceDocumentTypeSchema,
    sourceDocumentId: z.string().max(100),
    documentNumber: z.string().max(100),
    commitmentType: CommitmentTypeSchema,
    amountMinor: MoneyMinorSchema,
    status: CommitmentStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BudgetCommitmentV1 = z.infer<typeof BudgetCommitmentV1Schema>;

export const BudgetCheckResultV1Schema = z
  .object({
    isAllowed: z.boolean(),
    budgetLineId: z.string().uuid().optional().nullable(),
    allocatedAmountMinor: MoneyMinorSchema,
    actualAmountMinor: MoneyMinorSchema,
    encumberedAmountMinor: MoneyMinorSchema,
    availableAmountMinor: MoneyMinorSchema,
    requestedAmountMinor: MoneyMinorSchema,
    resultingAvailableMinor: MoneyMinorSchema,
    controlAction: BudgetControlActionSchema,
    toleranceThresholdPct: z.number(),
    message: z.string(),
  })
  .strict();
export type BudgetCheckResultV1 = z.infer<typeof BudgetCheckResultV1Schema>;

export const BudgetVarianceLineV1Schema = z
  .object({
    budgetLineId: z.string().uuid(),
    accountId: z.string().uuid(),
    costCenterId: z.string().max(64),
    fiscalPeriodId: z.string().uuid(),
    allocatedMinor: MoneyMinorSchema,
    encumberedMinor: MoneyMinorSchema,
    actualMinor: MoneyMinorSchema,
    availableMinor: MoneyMinorSchema,
    varianceMinor: MoneyMinorSchema,
    burnRatePct: z.number(),
    isOverBudget: z.boolean(),
  })
  .strict();
export type BudgetVarianceLineV1 = z.infer<typeof BudgetVarianceLineV1Schema>;

export const BudgetVarianceReportV1Schema = z
  .object({
    budgetRevisionId: z.string().uuid(),
    fiscalYearId: z.string().uuid(),
    totalAllocatedMinor: MoneyMinorSchema,
    totalEncumberedMinor: MoneyMinorSchema,
    totalActualMinor: MoneyMinorSchema,
    totalAvailableMinor: MoneyMinorSchema,
    netVarianceMinor: MoneyMinorSchema,
    overallBurnRatePct: z.number(),
    lines: z.array(BudgetVarianceLineV1Schema),
  })
  .strict();
export type BudgetVarianceReportV1 = z.infer<typeof BudgetVarianceReportV1Schema>;

// ─── Input DTO Schemas ─────────────────────────────────────────────────────────

export const CreateBudgetStructureInputV1Schema = z
  .object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    budgetType: BudgetTypeSchema,
    accountingBookId: z.string().uuid(),
    controlAction: BudgetControlActionSchema.default('HARD_STOP'),
    allowOverspendThresholdPct: z.number().min(0).max(100).default(0),
  })
  .strict();
export type CreateBudgetStructureInputV1 = z.infer<typeof CreateBudgetStructureInputV1Schema>;

export const CreateBudgetRevisionInputV1Schema = z
  .object({
    budgetStructureId: z.string().uuid(),
    fiscalYearId: z.string().uuid(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type CreateBudgetRevisionInputV1 = z.infer<typeof CreateBudgetRevisionInputV1Schema>;

export const CreateBudgetLineInputV1Schema = z
  .object({
    budgetRevisionId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    accountId: z.string().uuid(),
    costCenterId: z.string().max(64),
    projectCode: z.string().max(64).optional(),
    allocatedAmountMinor: MoneyMinorSchema,
  })
  .strict();
export type CreateBudgetLineInputV1 = z.infer<typeof CreateBudgetLineInputV1Schema>;

export const CheckBudgetAvailabilityInputV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    accountId: z.string().uuid(),
    costCenterId: z.string().max(64),
    projectCode: z.string().max(64).optional(),
    requestedAmountMinor: MoneyMinorSchema,
  })
  .strict();
export type CheckBudgetAvailabilityInputV1 = z.infer<typeof CheckBudgetAvailabilityInputV1Schema>;

export const RecordCommitmentInputV1Schema = z
  .object({
    budgetLineId: z.string().uuid(),
    sourceDocumentType: BudgetSourceDocumentTypeSchema,
    sourceDocumentId: z.string().max(100),
    documentNumber: z.string().max(100),
    commitmentType: CommitmentTypeSchema,
    amountMinor: MoneyMinorSchema,
  })
  .strict();
export type RecordCommitmentInputV1 = z.infer<typeof RecordCommitmentInputV1Schema>;

export const LiquidateCommitmentInputV1Schema = z
  .object({
    commitmentId: z.string().uuid(),
    apBillId: z.string().max(100),
    actualAmountMinor: MoneyMinorSchema,
  })
  .strict();
export type LiquidateCommitmentInputV1 = z.infer<typeof LiquidateCommitmentInputV1Schema>;

export const ReleaseCommitmentInputV1Schema = z
  .object({
    commitmentId: z.string().uuid(),
    reason: z.string().max(500).optional(),
  })
  .strict();
export type ReleaseCommitmentInputV1 = z.infer<typeof ReleaseCommitmentInputV1Schema>;

export const DistributeAnnualBudgetInputV1Schema = z
  .object({
    budgetRevisionId: z.string().uuid(),
    accountId: z.string().uuid(),
    costCenterId: z.string().max(64),
    projectCode: z.string().max(64).optional(),
    annualAmountMinor: MoneyMinorSchema,
    fiscalPeriodIds: z.array(z.string().uuid()).min(1),
    distributionMethod: PeriodDistributionMethodSchema.default('EQUAL_MONTHLY'),
  })
  .strict();
export type DistributeAnnualBudgetInputV1 = z.infer<typeof DistributeAnnualBudgetInputV1Schema>;

// ─── CloudEvents ───────────────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  specversion: z.literal('1.0'),
  time: z.string().datetime(),
});

export const BudgetStructureCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.budget.structure.created.v1'),
  data: z.object({
    budgetStructureId: z.string().uuid(),
    code: z.string(),
    budgetType: BudgetTypeSchema,
    accountingBookId: z.string().uuid(),
    controlAction: BudgetControlActionSchema,
  }),
}).strict();
export type BudgetStructureCreatedEventV1 = z.infer<typeof BudgetStructureCreatedEventV1Schema>;

export const BudgetRevisionActivatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.budget.revision.activated.v1'),
  data: z.object({
    budgetRevisionId: z.string().uuid(),
    budgetStructureId: z.string().uuid(),
    revisionNumber: z.number().int(),
    totalAllocatedMinor: MoneyMinorSchema,
    activatedBy: z.string(),
  }),
}).strict();
export type BudgetRevisionActivatedEventV1 = z.infer<typeof BudgetRevisionActivatedEventV1Schema>;

export const CommitmentRecordedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.budget.commitment.recorded.v1'),
  data: z.object({
    commitmentId: z.string().uuid(),
    budgetLineId: z.string().uuid(),
    sourceDocumentType: BudgetSourceDocumentTypeSchema,
    documentNumber: z.string(),
    commitmentType: CommitmentTypeSchema,
    amountMinor: MoneyMinorSchema,
  }),
}).strict();
export type CommitmentRecordedEventV1 = z.infer<typeof CommitmentRecordedEventV1Schema>;

export const BudgetThresholdExceededEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.budget.threshold.exceeded.v1'),
  data: z.object({
    budgetLineId: z.string().uuid(),
    allocatedAmountMinor: MoneyMinorSchema,
    totalCommittedMinor: MoneyMinorSchema,
    requestedAmountMinor: MoneyMinorSchema,
    controlAction: BudgetControlActionSchema,
    attemptedBy: z.string(),
  }),
}).strict();
export type BudgetThresholdExceededEventV1 = z.infer<typeof BudgetThresholdExceededEventV1Schema>;

export type BudgetEventV1 =
  | BudgetStructureCreatedEventV1
  | BudgetRevisionActivatedEventV1
  | CommitmentRecordedEventV1
  | BudgetThresholdExceededEventV1;
