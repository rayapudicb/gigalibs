import { z } from 'zod';
import { CurrencyCodeSchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const ACCOUNT_CLASSES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export const AccountClassSchema = z.enum(ACCOUNT_CLASSES);
export type AccountClass = z.infer<typeof AccountClassSchema>;

export const ACCOUNT_SUBTYPES = [
  'BANK',
  'ACCOUNTS_RECEIVABLE',
  'CURRENT_ASSET',
  'FIXED_ASSET',
  'OTHER_ASSET',
  'ACCOUNTS_PAYABLE',
  'CURRENT_LIABILITY',
  'LONG_TERM_LIABILITY',
  'EQUITY',
  'RETAINED_EARNINGS',
  'OPERATING_REVENUE',
  'OTHER_REVENUE',
  'COST_OF_GOODS_SOLD',
  'OPERATING_EXPENSE',
  'TAX_EXPENSE',
  'OTHER_EXPENSE',
] as const;
export const AccountSubtypeSchema = z.enum(ACCOUNT_SUBTYPES);
export type AccountSubtype = z.infer<typeof AccountSubtypeSchema>;

export const NORMAL_BALANCES = ['DEBIT', 'CREDIT'] as const;
export const NormalBalanceSchema = z.enum(NORMAL_BALANCES);
export type NormalBalance = z.infer<typeof NormalBalanceSchema>;

export const PERIOD_STATUSES = ['FUTURE', 'OPEN', 'SOFT_CLOSED', 'LOCKED'] as const;
export const PeriodStatusSchema = z.enum(PERIOD_STATUSES);
export type PeriodStatus = z.infer<typeof PeriodStatusSchema>;

export const JOURNAL_ENTRY_TYPES = [
  'STANDARD_MANUAL',
  'SUBLEDGER_AP',
  'SUBLEDGER_AR',
  'SUBLEDGER_INVENTORY',
  'REVERSAL',
  'YEAR_END_CLOSE',
  'OPENING_BALANCE',
] as const;
export const JournalEntryTypeSchema = z.enum(JOURNAL_ENTRY_TYPES);
export type JournalEntryType = z.infer<typeof JournalEntryTypeSchema>;

export const JOURNAL_STATUSES = ['DRAFT', 'POSTED', 'REVERSED'] as const;
export const JournalStatusSchema = z.enum(JOURNAL_STATUSES);
export type JournalStatus = z.infer<typeof JournalStatusSchema>;

export const COSTING_METHODS = ['STANDARD', 'FIFO', 'AVERAGE'] as const;
export const CostingMethodSchema = z.enum(COSTING_METHODS);
export type CostingMethod = z.infer<typeof CostingMethodSchema>;

// ─── Shared Base Schemas ───────────────────────────────────────────────────────

export const AccountCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message: 'Account code must be alphanumeric and may contain dots, dashes, or underscores',
  });

export const ExchangeRateSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, { message: 'Exchange rate must be positive with up to 6 decimal places' });

// ─── 1. Accounting Books ──────────────────────────────────────────────────────

export const AccountingBookV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    bookCode: z.string().trim().min(1).max(50),
    bookName: z.string().trim().min(1).max(200),
    legalEntityPartyId: z.string().uuid(),
    currencyCode: CurrencyCodeSchema,
    costingMethod: CostingMethodSchema,
    isPrimary: z.boolean(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AccountingBookV1 = z.infer<typeof AccountingBookV1Schema>;

export const CreateAccountingBookInputV1Schema = z
  .object({
    bookCode: z.string().trim().min(1).max(50),
    bookName: z.string().trim().min(1).max(200),
    legalEntityPartyId: z.string().uuid(),
    currencyCode: CurrencyCodeSchema,
    costingMethod: CostingMethodSchema.default('STANDARD'),
    isPrimary: z.boolean().default(false),
  })
  .strict();
export type CreateAccountingBookInputV1 = z.infer<typeof CreateAccountingBookInputV1Schema>;

// ─── 2. Chart of Accounts ─────────────────────────────────────────────────────

export const AccountV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    accountingBookId: z.string().uuid(),
    accountCode: AccountCodeSchema,
    accountName: z.string().trim().min(1).max(200),
    accountClass: AccountClassSchema,
    accountSubtype: AccountSubtypeSchema,
    normalBalance: NormalBalanceSchema,
    parentAccountId: z.string().uuid().nullable().optional(),
    isReconcilable: z.boolean().default(false),
    isSubledgerControl: z.boolean().default(false),
    isSystemReserved: z.boolean().default(false),
    active: z.boolean().default(true),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AccountV1 = z.infer<typeof AccountV1Schema>;

export const CreateAccountInputV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    accountCode: AccountCodeSchema,
    accountName: z.string().trim().min(1).max(200),
    accountClass: AccountClassSchema,
    accountSubtype: AccountSubtypeSchema,
    normalBalance: NormalBalanceSchema,
    parentAccountId: z.string().uuid().nullable().optional(),
    isReconcilable: z.boolean().optional().default(false),
    isSubledgerControl: z.boolean().optional().default(false),
    isSystemReserved: z.boolean().optional().default(false),
  })
  .strict();
export type CreateAccountInputV1 = z.infer<typeof CreateAccountInputV1Schema>;

export const UpdateAccountInputV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    accountName: z.string().trim().min(1).max(200).optional(),
    parentAccountId: z.string().uuid().nullable().optional(),
    isReconcilable: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateAccountInputV1 = z.infer<typeof UpdateAccountInputV1Schema>;

// ─── 3. Fiscal Years & Periods ────────────────────────────────────────────────

export const FiscalYearV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    accountingBookId: z.string().uuid(),
    yearName: z.string().trim().min(1).max(50),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: PeriodStatusSchema,
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type FiscalYearV1 = z.infer<typeof FiscalYearV1Schema>;

export const CreateFiscalYearInputV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    yearName: z.string().trim().min(1).max(50),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CreateFiscalYearInputV1 = z.infer<typeof CreateFiscalYearInputV1Schema>;

export const FiscalPeriodV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    fiscalYearId: z.string().uuid(),
    accountingBookId: z.string().uuid(),
    periodNumber: z.number().int().min(1).max(13),
    periodName: z.string().trim().min(1).max(50),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: PeriodStatusSchema,
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type FiscalPeriodV1 = z.infer<typeof FiscalPeriodV1Schema>;

export const CreateFiscalPeriodInputV1Schema = z
  .object({
    fiscalYearId: z.string().uuid(),
    accountingBookId: z.string().uuid(),
    periodNumber: z.number().int().min(1).max(13),
    periodName: z.string().trim().min(1).max(50),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CreateFiscalPeriodInputV1 = z.infer<typeof CreateFiscalPeriodInputV1Schema>;

export const UpdatePeriodStatusInputV1Schema = z
  .object({
    status: PeriodStatusSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type UpdatePeriodStatusInputV1 = z.infer<typeof UpdatePeriodStatusInputV1Schema>;

// ─── 4. GL Journals & Fact Lines ──────────────────────────────────────────────

export const JournalLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    journalId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    accountId: z.string().uuid(),
    accountCode: AccountCodeSchema.optional(),
    accountName: z.string().optional(),
    debitAmountMinor: MoneyMinorSchema,
    creditAmountMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    exchangeRate: ExchangeRateSchema.default('1.000000'),
    baseDebitAmountMinor: MoneyMinorSchema,
    baseCreditAmountMinor: MoneyMinorSchema,
    memo: z.string().trim().max(500).nullable().optional(),
    dimensions: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type JournalLineV1 = z.infer<typeof JournalLineV1Schema>;

export const JournalV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    journalNumber: z.string().trim().min(1).max(64),
    accountingBookId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entryType: JournalEntryTypeSchema,
    sourceDocumentType: z.string().trim().max(50).nullable().optional(),
    sourceDocumentId: z.string().trim().max(128).nullable().optional(),
    description: z.string().trim().min(1).max(1000),
    status: JournalStatusSchema,
    totalDebitMinor: MoneyMinorSchema,
    totalCreditMinor: MoneyMinorSchema,
    reversedJournalId: z.string().uuid().nullable().optional(),
    lines: z.array(JournalLineV1Schema),
    version: z.number().int().positive(),
    postedAt: z.string().datetime().nullable().optional(),
    postedBy: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type JournalV1 = z.infer<typeof JournalV1Schema>;

export const PostJournalLineInputV1Schema = z
  .object({
    accountId: z.string().uuid(),
    debitAmountMinor: MoneyMinorSchema.default('0'),
    creditAmountMinor: MoneyMinorSchema.default('0'),
    currencyCode: CurrencyCodeSchema.optional(),
    exchangeRate: ExchangeRateSchema.optional().default('1.000000'),
    memo: z.string().trim().max(500).optional(),
    dimensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PostJournalLineInputV1 = z.infer<typeof PostJournalLineInputV1Schema>;

export const PostJournalInputV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    fiscalPeriodId: z.string().uuid(),
    postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entryType: JournalEntryTypeSchema.default('STANDARD_MANUAL'),
    sourceDocumentType: z.string().trim().max(50).optional(),
    sourceDocumentId: z.string().trim().max(128).optional(),
    description: z.string().trim().min(1).max(1000),
    lines: z.array(PostJournalLineInputV1Schema).min(2),
  })
  .strict();
export type PostJournalInputV1 = z.infer<typeof PostJournalInputV1Schema>;

export const ReverseJournalInputV1Schema = z
  .object({
    journalId: z.string().uuid(),
    reversalPostingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fiscalPeriodId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export type ReverseJournalInputV1 = z.infer<typeof ReverseJournalInputV1Schema>;

// ─── 5. Financial Statements & Reports ────────────────────────────────────────

export const TrialBalanceLineV1Schema = z
  .object({
    accountId: z.string().uuid(),
    accountCode: AccountCodeSchema,
    accountName: z.string(),
    accountClass: AccountClassSchema,
    accountSubtype: AccountSubtypeSchema,
    normalBalance: NormalBalanceSchema,
    debitTurnoverMinor: MoneyMinorSchema,
    creditTurnoverMinor: MoneyMinorSchema,
    endingDebitMinor: MoneyMinorSchema,
    endingCreditMinor: MoneyMinorSchema,
  })
  .strict();
export type TrialBalanceLineV1 = z.infer<typeof TrialBalanceLineV1Schema>;

export const TrialBalanceReportV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    bookCode: z.string(),
    currencyCode: CurrencyCodeSchema,
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z.array(TrialBalanceLineV1Schema),
    totalDebitsMinor: MoneyMinorSchema,
    totalCreditsMinor: MoneyMinorSchema,
    isBalanced: z.boolean(),
  })
  .strict();
export type TrialBalanceReportV1 = z.infer<typeof TrialBalanceReportV1Schema>;

export const BalanceSheetSectionItemV1Schema = z
  .object({
    accountId: z.string().uuid(),
    accountCode: AccountCodeSchema,
    accountName: z.string(),
    amountMinor: MoneyMinorSchema,
  })
  .strict();
export type BalanceSheetSectionItemV1 = z.infer<typeof BalanceSheetSectionItemV1Schema>;

export const BalanceSheetSectionV1Schema = z
  .object({
    sectionName: z.string(),
    totalMinor: MoneyMinorSchema,
    items: z.array(BalanceSheetSectionItemV1Schema),
  })
  .strict();

export const BalanceSheetReportV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    bookCode: z.string(),
    currencyCode: CurrencyCodeSchema,
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    assets: z.object({
      totalMinor: MoneyMinorSchema,
      sections: z.array(BalanceSheetSectionV1Schema),
    }),
    liabilities: z.object({
      totalMinor: MoneyMinorSchema,
      sections: z.array(BalanceSheetSectionV1Schema),
    }),
    equity: z.object({
      totalMinor: MoneyMinorSchema,
      sections: z.array(BalanceSheetSectionV1Schema),
    }),
    isBalanced: z.boolean(),
  })
  .strict();
export type BalanceSheetReportV1 = z.infer<typeof BalanceSheetReportV1Schema>;

export const IncomeStatementReportV1Schema = z
  .object({
    accountingBookId: z.string().uuid(),
    bookCode: z.string(),
    currencyCode: CurrencyCodeSchema,
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revenues: z.object({
      totalMinor: MoneyMinorSchema,
      items: z.array(BalanceSheetSectionItemV1Schema),
    }),
    costOfGoodsSold: z.object({
      totalMinor: MoneyMinorSchema,
      items: z.array(BalanceSheetSectionItemV1Schema),
    }),
    grossProfitMinor: MoneyMinorSchema,
    operatingExpenses: z.object({
      totalMinor: MoneyMinorSchema,
      items: z.array(BalanceSheetSectionItemV1Schema),
    }),
    operatingIncomeMinor: MoneyMinorSchema,
    netIncomeMinor: MoneyMinorSchema,
  })
  .strict();
export type IncomeStatementReportV1 = z.infer<typeof IncomeStatementReportV1Schema>;

// ─── 6. Outbox Events (CloudEvents standard) ──────────────────────────────────

export const JournalPostedEventV1Schema = z
  .object({
    specversion: z.literal('1.0'),
    id: z.string().uuid(),
    source: z.literal('gigalibs.financial-operations'),
    type: z.literal('finance.journal.posted.v1'),
    tenantId: z.string().min(1).max(64),
    subject: z.string(),
    time: z.string().datetime(),
    correlationId: z.string(),
    causationId: z.string().optional(),
    data: z.object({
      journalId: z.string().uuid(),
      journalNumber: z.string(),
      accountingBookId: z.string().uuid(),
      fiscalPeriodId: z.string().uuid(),
      postingDate: z.string(),
      entryType: JournalEntryTypeSchema,
      totalDebitMinor: MoneyMinorSchema,
      totalCreditMinor: MoneyMinorSchema,
      postedAt: z.string().datetime(),
      postedBy: z.string(),
    }),
  })
  .strict();
export type JournalPostedEventV1 = z.infer<typeof JournalPostedEventV1Schema>;

export const JournalReversedEventV1Schema = z
  .object({
    specversion: z.literal('1.0'),
    id: z.string().uuid(),
    source: z.literal('gigalibs.financial-operations'),
    type: z.literal('finance.journal.reversed.v1'),
    tenantId: z.string().min(1).max(64),
    subject: z.string(),
    time: z.string().datetime(),
    correlationId: z.string(),
    causationId: z.string().optional(),
    data: z.object({
      reversalJournalId: z.string().uuid(),
      reversalJournalNumber: z.string(),
      originalJournalId: z.string().uuid(),
      accountingBookId: z.string().uuid(),
      fiscalPeriodId: z.string().uuid(),
      postingDate: z.string(),
      reversedAt: z.string().datetime(),
      reversedBy: z.string(),
      reason: z.string(),
    }),
  })
  .strict();
export type JournalReversedEventV1 = z.infer<typeof JournalReversedEventV1Schema>;

export const FiscalPeriodLockedEventV1Schema = z
  .object({
    specversion: z.literal('1.0'),
    id: z.string().uuid(),
    source: z.literal('gigalibs.financial-operations'),
    type: z.literal('finance.period.locked.v1'),
    tenantId: z.string().min(1).max(64),
    subject: z.string(),
    time: z.string().datetime(),
    correlationId: z.string(),
    causationId: z.string().optional(),
    data: z.object({
      fiscalPeriodId: z.string().uuid(),
      periodName: z.string(),
      accountingBookId: z.string().uuid(),
      lockedAt: z.string().datetime(),
      lockedBy: z.string(),
    }),
  })
  .strict();
export type FiscalPeriodLockedEventV1 = z.infer<typeof FiscalPeriodLockedEventV1Schema>;
