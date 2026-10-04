import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';

// ─── Period Close & Forecasting Enums & Value Sets ────────────────────────────

export const SUBLEDGER_TYPES = [
  'AP',
  'AR',
  'INVENTORY',
  'FIXED_ASSETS',
  'TREASURY',
  'GL',
] as const;
export const SubledgerTypeSchema = z.enum(SUBLEDGER_TYPES);
export type SubledgerType = z.infer<typeof SubledgerTypeSchema>;

export const SUBLEDGER_LOCK_STATUSES = [
  'OPEN',
  'SOFT_LOCKED',
  'HARD_LOCKED',
] as const;
export const SubledgerLockStatusSchema = z.enum(SUBLEDGER_LOCK_STATUSES);
export type SubledgerLockStatus = z.infer<typeof SubledgerLockStatusSchema>;

export const CHECKLIST_TASK_TYPES = [
  'BANK_RECONCILIATION',
  'INVENTORY_VALUATION',
  'DEPRECIATION_RUN',
  'ACCRUAL_AMORTIZATION',
  'INTERCOMPANY_ELIMINATION',
  'TAX_CALCULATION',
  'TRIAL_BALANCE_VERIFICATION',
  'MAKER_CHECKER_APPROVAL',
] as const;
export const ChecklistTaskTypeSchema = z.enum(CHECKLIST_TASK_TYPES);
export type ChecklistTaskType = z.infer<typeof ChecklistTaskTypeSchema>;

export const CHECKLIST_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
] as const;
export const ChecklistTaskStatusSchema = z.enum(CHECKLIST_TASK_STATUSES);
export type ChecklistTaskStatus = z.infer<typeof ChecklistTaskStatusSchema>;

export const AMORTIZATION_TYPES = [
  'EXPENSE_ACCRUAL',
  'PREPAYMENT_AMORTIZATION',
  'DEFERRED_REVENUE_AMORTIZATION',
] as const;
export const AmortizationTypeSchema = z.enum(AMORTIZATION_TYPES);
export type AmortizationType = z.infer<typeof AmortizationTypeSchema>;

export const AMORTIZATION_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export const AmortizationStatusSchema = z.enum(AMORTIZATION_STATUSES);
export type AmortizationStatus = z.infer<typeof AmortizationStatusSchema>;

export const AMORTIZATION_LINE_STATUSES = [
  'PENDING',
  'POSTED',
  'REVERSED',
] as const;
export const AmortizationLineStatusSchema = z.enum(AMORTIZATION_LINE_STATUSES);
export type AmortizationLineStatus = z.infer<typeof AmortizationLineStatusSchema>;

export const YEAR_END_CLOSE_STATUSES = [
  'DRAFT',
  'PREVIEWED',
  'POSTED',
  'REVERSED',
] as const;
export const YearEndCloseStatusSchema = z.enum(YEAR_END_CLOSE_STATUSES);
export type YearEndCloseStatus = z.infer<typeof YearEndCloseStatusSchema>;

export const FORECAST_METHODS = [
  'HISTORICAL_RUN_RATE',
  'WEIGHTED_MOVING_AVG',
  'BUDGET_ADJUSTED',
] as const;
export const ForecastMethodSchema = z.enum(FORECAST_METHODS);
export type ForecastMethod = z.infer<typeof ForecastMethodSchema>;

export const STATEMENT_TYPES = [
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
  'CASH_FLOW',
] as const;
export const StatementTypeSchema = z.enum(STATEMENT_TYPES);
export type StatementType = z.infer<typeof StatementTypeSchema>;

// ─── Entity Schemas ──────────────────────────────────────────────────────────

export const PeriodSubledgerLockV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  subledgerType: SubledgerTypeSchema,
  lockStatus: SubledgerLockStatusSchema,
  lockedAt: z.string().datetime().optional().nullable(),
  lockedBy: z.string().max(128).optional().nullable(),
  unlockedAt: z.string().datetime().optional().nullable(),
  unlockedBy: z.string().max(128).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type PeriodSubledgerLockV1 = z.infer<typeof PeriodSubledgerLockV1Schema>;

export const PeriodCloseChecklistV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  taskType: ChecklistTaskTypeSchema,
  taskName: z.string().min(1).max(128),
  taskStatus: ChecklistTaskStatusSchema,
  sequenceOrder: z.number().int().min(1),
  dependsOnTaskType: ChecklistTaskTypeSchema.optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  completedBy: z.string().max(128).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  evidenceRef: z.string().max(256).optional().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type PeriodCloseChecklistV1 = z.infer<typeof PeriodCloseChecklistV1Schema>;

export const AccrualAmortizationScheduleV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  scheduleNumber: z.string().min(1).max(64),
  scheduleName: z.string().min(1).max(128),
  amortizationType: AmortizationTypeSchema,
  sourceDocumentType: z.string().max(64).optional().nullable(),
  sourceDocumentRef: z.string().max(128).optional().nullable(),
  totalAmountMinor: MoneyMinorSchema,
  recognizedAmountMinor: MoneyMinorSchema,
  remainingAmountMinor: MoneyMinorSchema,
  currencyCode: z.string().length(3),
  expenseAccountId: z.string().uuid(),
  balanceSheetAccountId: z.string().uuid(),
  startPeriodId: z.string().uuid(),
  endPeriodId: z.string().uuid().optional().nullable(),
  periodsCount: z.number().int().min(1).max(120),
  status: AmortizationStatusSchema,
  autoReversal: z.boolean().default(false),
  notes: z.string().max(1000).optional().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type AccrualAmortizationScheduleV1 = z.infer<typeof AccrualAmortizationScheduleV1Schema>;

export const AccrualAmortizationLineV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  scheduleId: z.string().uuid(),
  periodNumber: z.number().int().min(1),
  fiscalPeriodId: z.string().uuid(),
  scheduledDate: z.string(),
  amountMinor: MoneyMinorSchema,
  status: AmortizationLineStatusSchema,
  glJournalId: z.string().uuid().optional().nullable(),
  autoReversalJournalId: z.string().uuid().optional().nullable(),
  postedAt: z.string().datetime().optional().nullable(),
  postedBy: z.string().max(128).optional().nullable(),
  reversedAt: z.string().datetime().optional().nullable(),
  reversedBy: z.string().max(128).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type AccrualAmortizationLineV1 = z.infer<typeof AccrualAmortizationLineV1Schema>;

export const YearEndCloseRunV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  retainedEarningsAccountId: z.string().uuid(),
  totalRevenueMinor: MoneyMinorSchema,
  totalExpenseMinor: MoneyMinorSchema,
  netIncomeMinor: MoneyMinorSchema,
  currencyCode: z.string().length(3),
  closingJournalId: z.string().uuid().optional().nullable(),
  status: YearEndCloseStatusSchema,
  previewSummary: z.record(z.string(), z.unknown()).optional().nullable(),
  closedAt: z.string().datetime().optional().nullable(),
  closedBy: z.string().max(128).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type YearEndCloseRunV1 = z.infer<typeof YearEndCloseRunV1Schema>;

export const FinancialForecastModelV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  modelName: z.string().min(1).max(128),
  forecastMethod: ForecastMethodSchema,
  basePeriodsCount: z.number().int().min(1).max(36).default(3),
  growthRateBps: z.number().int().min(-5000).max(10000).default(0), // basis points (100 = 1%)
  inflationRateBps: z.number().int().min(0).max(5000).default(0),
  forecastHorizonPeriods: z.number().int().min(1).max(36).default(12),
  includeCommitments: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type FinancialForecastModelV1 = z.infer<typeof FinancialForecastModelV1Schema>;

export const FinancialForecastLineV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  modelId: z.string().uuid(),
  projectionPeriodIndex: z.number().int().min(1),
  fiscalPeriodId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  accountType: z.string().max(32).optional().nullable(),
  baselineAmountMinor: MoneyMinorSchema,
  forecastAmountMinor: MoneyMinorSchema,
  encumbranceAdjustedAmountMinor: MoneyMinorSchema,
  confidenceLowMinor: MoneyMinorSchema,
  confidenceHighMinor: MoneyMinorSchema,
  currencyCode: z.string().length(3),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type FinancialForecastLineV1 = z.infer<typeof FinancialForecastLineV1Schema>;

export const FinancialHealthRatiosV1Schema = z.object({
  tenantId: z.string().min(1).max(64),
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  currentRatio: z.string(), // e.g. "2.15" or "N/A"
  quickRatio: z.string(),   // e.g. "1.64" or "N/A"
  workingCapitalMinor: MoneyMinorSchema,
  debtToEquityRatio: z.string(), // e.g. "0.85" or "N/A"
  operatingMarginBps: z.number().int(), // basis points
  computedAt: z.string().datetime(),
}).strict();
export type FinancialHealthRatiosV1 = z.infer<typeof FinancialHealthRatiosV1Schema>;

export const StatementDrillThroughItemV1Schema = z.object({
  lineCode: z.string().max(64),
  lineName: z.string().max(128),
  statementType: StatementTypeSchema,
  accountId: z.string().uuid(),
  accountCode: z.string().max(64),
  accountName: z.string().max(128),
  accountType: z.string().max(32),
  openingBalanceMinor: MoneyMinorSchema,
  debitMovementMinor: MoneyMinorSchema,
  creditMovementMinor: MoneyMinorSchema,
  closingBalanceMinor: MoneyMinorSchema,
  journalCount: z.number().int().nonnegative(),
  subledgerSourceCount: z.number().int().nonnegative(),
}).strict();
export type StatementDrillThroughItemV1 = z.infer<typeof StatementDrillThroughItemV1Schema>;

// ─── Input DTO Schemas ───────────────────────────────────────────────────────

export const SetSubledgerLockInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  subledgerType: SubledgerTypeSchema,
  lockStatus: SubledgerLockStatusSchema,
  notes: z.string().max(1000).optional(),
}).strict();
export type SetSubledgerLockInputV1 = z.infer<typeof SetSubledgerLockInputV1Schema>;

export const UpdateChecklistTaskInputV1Schema = z.object({
  taskId: z.string().uuid(),
  taskStatus: ChecklistTaskStatusSchema,
  notes: z.string().max(1000).optional(),
  evidenceRef: z.string().max(256).optional(),
}).strict();
export type UpdateChecklistTaskInputV1 = z.infer<typeof UpdateChecklistTaskInputV1Schema>;

export const CreateAccrualAmortizationScheduleInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  scheduleName: z.string().min(1).max(128),
  amortizationType: AmortizationTypeSchema,
  sourceDocumentType: z.string().max(64).optional(),
  sourceDocumentRef: z.string().max(128).optional(),
  totalAmountMinor: MoneyMinorSchema,
  currencyCode: z.string().length(3),
  expenseAccountId: z.string().uuid(),
  balanceSheetAccountId: z.string().uuid(),
  startPeriodId: z.string().uuid(),
  periodsCount: z.number().int().min(1).max(120),
  autoReversal: z.boolean().optional().default(false),
  notes: z.string().max(1000).optional(),
}).strict();
export type CreateAccrualAmortizationScheduleInputV1 = z.infer<typeof CreateAccrualAmortizationScheduleInputV1Schema>;

export const ExecuteAmortizationLineInputV1Schema = z.object({
  lineId: z.string().uuid(),
  postingDate: z.string().optional(),
}).strict();
export type ExecuteAmortizationLineInputV1 = z.infer<typeof ExecuteAmortizationLineInputV1Schema>;

export const PreviewYearEndCloseInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  retainedEarningsAccountId: z.string().uuid(),
}).strict();
export type PreviewYearEndCloseInputV1 = z.infer<typeof PreviewYearEndCloseInputV1Schema>;

export const ExecuteYearEndCloseInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  retainedEarningsAccountId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
}).strict();
export type ExecuteYearEndCloseInputV1 = z.infer<typeof ExecuteYearEndCloseInputV1Schema>;

export const CreateForecastModelInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  modelName: z.string().min(1).max(128),
  forecastMethod: ForecastMethodSchema,
  basePeriodsCount: z.number().int().min(1).max(36).optional().default(3),
  growthRateBps: z.number().int().min(-5000).max(10000).optional().default(0),
  inflationRateBps: z.number().int().min(0).max(5000).optional().default(0),
  forecastHorizonPeriods: z.number().int().min(1).max(36).optional().default(12),
  includeCommitments: z.boolean().optional().default(true),
  notes: z.string().max(1000).optional(),
}).strict();
export type CreateForecastModelInputV1 = z.infer<typeof CreateForecastModelInputV1Schema>;

export const GenerateForecastInputV1Schema = z.object({
  modelId: z.string().uuid(),
}).strict();
export type GenerateForecastInputV1 = z.infer<typeof GenerateForecastInputV1Schema>;

export const ComputeFinancialHealthInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
}).strict();
export type ComputeFinancialHealthInputV1 = z.infer<typeof ComputeFinancialHealthInputV1Schema>;

export const QueryDrillThroughInputV1Schema = z.object({
  accountingBookId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  statementType: StatementTypeSchema,
  lineCode: z.string().max(64).optional(),
}).strict();
export type QueryDrillThroughInputV1 = z.infer<typeof QueryDrillThroughInputV1Schema>;

// ─── Outbox Events ───────────────────────────────────────────────────────────

export const SubledgerLockUpdatedEventV1Schema = z.object({
  type: z.literal('finance.subledger_lock.updated.v1'),
  data: z.object({
    lockId: z.string().uuid(),
    accountingBookId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    subledgerType: SubledgerTypeSchema,
    lockStatus: SubledgerLockStatusSchema,
    lockedBy: z.string().optional().nullable(),
  }),
}).strict();
export type SubledgerLockUpdatedEventV1 = z.infer<typeof SubledgerLockUpdatedEventV1Schema>;

export const PeriodCloseChecklistUpdatedEventV1Schema = z.object({
  type: z.literal('finance.close_checklist.updated.v1'),
  data: z.object({
    taskId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    taskType: ChecklistTaskTypeSchema,
    taskStatus: ChecklistTaskStatusSchema,
    completedBy: z.string().optional().nullable(),
  }),
}).strict();
export type PeriodCloseChecklistUpdatedEventV1 = z.infer<typeof PeriodCloseChecklistUpdatedEventV1Schema>;

export const AmortizationScheduleCreatedEventV1Schema = z.object({
  type: z.literal('finance.amortization_schedule.created.v1'),
  data: z.object({
    scheduleId: z.string().uuid(),
    scheduleNumber: z.string(),
    amortizationType: AmortizationTypeSchema,
    totalAmountMinor: MoneyMinorSchema,
    periodsCount: z.number().int(),
  }),
}).strict();
export type AmortizationScheduleCreatedEventV1 = z.infer<typeof AmortizationScheduleCreatedEventV1Schema>;

export const AmortizationLinePostedEventV1Schema = z.object({
  type: z.literal('finance.amortization_line.posted.v1'),
  data: z.object({
    lineId: z.string().uuid(),
    scheduleId: z.string().uuid(),
    glJournalId: z.string().uuid(),
    amountMinor: MoneyMinorSchema,
  }),
}).strict();
export type AmortizationLinePostedEventV1 = z.infer<typeof AmortizationLinePostedEventV1Schema>;

export const YearEndCloseExecutedEventV1Schema = z.object({
  type: z.literal('finance.year_end_close.executed.v1'),
  data: z.object({
    runId: z.string().uuid(),
    fiscalYearId: z.string().uuid(),
    netIncomeMinor: MoneyMinorSchema,
    closingJournalId: z.string().uuid(),
  }),
}).strict();
export type YearEndCloseExecutedEventV1 = z.infer<typeof YearEndCloseExecutedEventV1Schema>;

export const ForecastGeneratedEventV1Schema = z.object({
  type: z.literal('finance.forecast.generated.v1'),
  data: z.object({
    modelId: z.string().uuid(),
    linesCount: z.number().int(),
  }),
}).strict();
export type ForecastGeneratedEventV1 = z.infer<typeof ForecastGeneratedEventV1Schema>;
