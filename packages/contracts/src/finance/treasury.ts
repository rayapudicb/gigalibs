import { z } from 'zod';
import { CurrencyCodeSchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Treasury Enums & Value Sets ───────────────────────────────────────────────

export const BANK_ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'FROZEN'] as const;
export const BankAccountStatusSchema = z.enum(BANK_ACCOUNT_STATUSES);
export type BankAccountStatus = z.infer<typeof BankAccountStatusSchema>;

export const STATEMENT_FORMATS = ['CAMT053', 'MT940', 'OFX', 'CSV'] as const;
export const StatementFormatSchema = z.enum(STATEMENT_FORMATS);
export type StatementFormat = z.infer<typeof StatementFormatSchema>;

export const STATEMENT_STATUSES = ['IMPORTED', 'RECONCILING', 'RECONCILED'] as const;
export const StatementStatusSchema = z.enum(STATEMENT_STATUSES);
export type StatementStatus = z.infer<typeof StatementStatusSchema>;

export const STATEMENT_TRANSACTION_TYPES = ['CREDIT', 'DEBIT'] as const;
export const StatementTransactionTypeSchema = z.enum(STATEMENT_TRANSACTION_TYPES);
export type StatementTransactionType = z.infer<typeof StatementTransactionTypeSchema>;

export const BANK_MATCH_STATUSES = ['UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'ADJUSTED'] as const;
export const BankMatchStatusSchema = z.enum(BANK_MATCH_STATUSES);
export type BankMatchStatus = z.infer<typeof BankMatchStatusSchema>;

export const RECONCILIATION_STATUSES = ['OPEN', 'BALANCED', 'SEALED'] as const;
export const ReconciliationStatusSchema = z.enum(RECONCILIATION_STATUSES);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

export const MATCH_RULES = [
  'EXACT_REF_AMOUNT',
  'DATE_WINDOW_AMOUNT',
  'MANUAL_OVERRIDE',
  'FEE_ADJUSTMENT',
] as const;
export const MatchRuleSchema = z.enum(MATCH_RULES);
export type MatchRule = z.infer<typeof MatchRuleSchema>;

// ─── Domain Entity Schemas ─────────────────────────────────────────────────────

export const BankAccountV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    accountName: z.string().trim().min(1).max(200),
    accountNumber: z.string().trim().min(1).max(100),
    routingCode: z.string().trim().max(100).optional().nullable(),
    iban: z.string().trim().max(100).optional().nullable(),
    swiftBic: z.string().trim().max(20).optional().nullable(),
    currencyCode: CurrencyCodeSchema,
    glCashAccountId: z.string().uuid(),
    currentClearedBalanceMinor: MoneyMinorSchema,
    status: BankAccountStatusSchema,
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().optional().nullable(),
    updatedBy: z.string().optional().nullable(),
  })
  .strict();
export type BankAccountV1 = z.infer<typeof BankAccountV1Schema>;

export const BankStatementLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    statementId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountMinor: MoneyMinorSchema,
    transactionType: StatementTransactionTypeSchema,
    reference: z.string().trim().max(200).optional().nullable(),
    checkNumber: z.string().trim().max(50).optional().nullable(),
    counterpartyName: z.string().trim().max(200).optional().nullable(),
    counterpartyAccount: z.string().trim().max(100).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    matchStatus: BankMatchStatusSchema,
    matchedAt: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type BankStatementLineV1 = z.infer<typeof BankStatementLineV1Schema>;

export const BankStatementV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    bankAccountId: z.string().uuid(),
    statementNumber: z.string().trim().min(1).max(100),
    statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    openingBalanceMinor: MoneyMinorSchema,
    closingBalanceMinor: MoneyMinorSchema,
    format: StatementFormatSchema,
    sourceChecksum: z.string().length(64),
    status: StatementStatusSchema,
    lineCount: z.number().int().nonnegative().optional(),
    lines: z.array(BankStatementLineV1Schema).optional(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BankStatementV1 = z.infer<typeof BankStatementV1Schema>;

export const BankReconciliationMatchV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    reconciliationId: z.string().uuid(),
    statementLineId: z.string().uuid(),
    glJournalLineId: z.string().uuid(),
    matchedAmountMinor: MoneyMinorSchema,
    matchRule: MatchRuleSchema,
    matchedBy: z.string().min(1).max(100),
    createdAt: z.string().datetime(),
  })
  .strict();
export type BankReconciliationMatchV1 = z.infer<typeof BankReconciliationMatchV1Schema>;

export const BankReconciliationSessionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    bankAccountId: z.string().uuid(),
    statementId: z.string().uuid(),
    reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementEndingBalanceMinor: MoneyMinorSchema,
    clearedBookBalanceMinor: MoneyMinorSchema,
    unreconciledDifferenceMinor: MoneyMinorSchema,
    status: ReconciliationStatusSchema,
    sealHash: z.string().length(64).optional().nullable(),
    sealedAt: z.string().datetime().optional().nullable(),
    sealedBy: z.string().optional().nullable(),
    matches: z.array(BankReconciliationMatchV1Schema).optional(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BankReconciliationSessionV1 = z.infer<typeof BankReconciliationSessionV1Schema>;

export const BankReconciliationReportV1Schema = z
  .object({
    reconciliationId: z.string().uuid(),
    bankAccountId: z.string().uuid(),
    bankAccountName: z.string(),
    currencyCode: CurrencyCodeSchema,
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementEndingBalanceMinor: MoneyMinorSchema,
    clearedBookBalanceMinor: MoneyMinorSchema,
    outstandingDepositsMinor: MoneyMinorSchema,
    outstandingChecksMinor: MoneyMinorSchema,
    adjustedBookBalanceMinor: MoneyMinorSchema,
    unreconciledDifferenceMinor: MoneyMinorSchema,
    isBalanced: z.boolean(),
    status: ReconciliationStatusSchema,
    sealHash: z.string().optional().nullable(),
    generatedAt: z.string().datetime(),
  })
  .strict();
export type BankReconciliationReportV1 = z.infer<typeof BankReconciliationReportV1Schema>;

// ─── Input DTO Schemas ─────────────────────────────────────────────────────────

export const CreateBankAccountInputV1Schema = z
  .object({
    accountName: z.string().trim().min(1).max(200),
    accountNumber: z.string().trim().min(1).max(100),
    routingCode: z.string().trim().max(100).optional(),
    iban: z.string().trim().max(100).optional(),
    swiftBic: z.string().trim().max(20).optional(),
    currencyCode: CurrencyCodeSchema,
    glCashAccountId: z.string().uuid(),
    initialBalanceMinor: MoneyMinorSchema.optional().default('0'),
  })
  .strict();
export type CreateBankAccountInputV1 = z.infer<typeof CreateBankAccountInputV1Schema>;

export const ParsedStatementLineInputV1Schema = z
  .object({
    lineNumber: z.number().int().positive(),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountMinor: MoneyMinorSchema,
    transactionType: StatementTransactionTypeSchema,
    reference: z.string().trim().max(200).optional().nullable(),
    checkNumber: z.string().trim().max(50).optional().nullable(),
    counterpartyName: z.string().trim().max(200).optional().nullable(),
    counterpartyAccount: z.string().trim().max(100).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();
export type ParsedStatementLineInputV1 = z.infer<typeof ParsedStatementLineInputV1Schema>;

export const ImportBankStatementInputV1Schema = z
  .object({
    bankAccountId: z.string().uuid(),
    statementNumber: z.string().trim().min(1).max(100),
    statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    openingBalanceMinor: MoneyMinorSchema,
    closingBalanceMinor: MoneyMinorSchema,
    format: StatementFormatSchema,
    rawContent: z.string().min(1),
    parsedLines: z.array(ParsedStatementLineInputV1Schema).min(1),
  })
  .strict();
export type ImportBankStatementInputV1 = z.infer<typeof ImportBankStatementInputV1Schema>;

export const AutoMatchInputV1Schema = z
  .object({
    reconciliationId: z.string().uuid(),
    dateToleranceDays: z.number().int().min(0).max(30).default(3),
  })
  .strict();
export type AutoMatchInputV1 = z.infer<typeof AutoMatchInputV1Schema>;

export const ManualMatchInputV1Schema = z
  .object({
    reconciliationId: z.string().uuid(),
    statementLineId: z.string().uuid(),
    glJournalLineId: z.string().uuid(),
    matchRule: MatchRuleSchema.default('MANUAL_OVERRIDE'),
  })
  .strict();
export type ManualMatchInputV1 = z.infer<typeof ManualMatchInputV1Schema>;

export const CreateFeeAdjustmentInputV1Schema = z
  .object({
    reconciliationId: z.string().uuid(),
    statementLineId: z.string().uuid(),
    expenseAccountId: z.string().uuid(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();
export type CreateFeeAdjustmentInputV1 = z.infer<typeof CreateFeeAdjustmentInputV1Schema>;

export const SealReconciliationInputV1Schema = z
  .object({
    reconciliationId: z.string().uuid(),
  })
  .strict();
export type SealReconciliationInputV1 = z.infer<typeof SealReconciliationInputV1Schema>;

export const CreateReconciliationSessionInputV1Schema = z
  .object({
    bankAccountId: z.string().uuid(),
    statementId: z.string().uuid(),
    reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CreateReconciliationSessionInputV1 = z.infer<typeof CreateReconciliationSessionInputV1Schema>;

// ─── Outbox Events ─────────────────────────────────────────────────────────────

const BaseEventSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    source: z.literal('finance.treasury'),
    specversion: z.literal('1.0'),
    time: z.string().datetime(),
    datacontenttype: z.literal('application/json'),
  })
  .strict();

export const BankStatementImportedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.bank.statement.imported.v1'),
  data: z
    .object({
      statementId: z.string().uuid(),
      bankAccountId: z.string().uuid(),
      statementNumber: z.string(),
      lineCount: z.number().int().positive(),
      closingBalanceMinor: MoneyMinorSchema,
      sourceChecksum: z.string(),
    })
    .strict(),
}).strict();
export type BankStatementImportedEventV1 = z.infer<typeof BankStatementImportedEventV1Schema>;

export const BankReconciliationSealedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('finance.bank.reconciliation.sealed.v1'),
  data: z
    .object({
      reconciliationId: z.string().uuid(),
      bankAccountId: z.string().uuid(),
      statementId: z.string().uuid(),
      reconciliationDate: z.string(),
      statementEndingBalanceMinor: MoneyMinorSchema,
      clearedBookBalanceMinor: MoneyMinorSchema,
      sealHash: z.string(),
      sealedBy: z.string(),
      matchCount: z.number().int().nonnegative(),
    })
    .strict(),
}).strict();
export type BankReconciliationSealedEventV1 = z.infer<typeof BankReconciliationSealedEventV1Schema>;

export type TreasuryEventV1 =
  | BankStatementImportedEventV1
  | BankReconciliationSealedEventV1;
