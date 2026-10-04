import { describe, it, expect } from 'vitest';
import {
  SUBLEDGER_TYPES,
  SUBLEDGER_LOCK_STATUSES,
  CHECKLIST_TASK_TYPES,
  CHECKLIST_TASK_STATUSES,
  AMORTIZATION_TYPES,
  AMORTIZATION_STATUSES,
  YEAR_END_CLOSE_STATUSES,
  FORECAST_METHODS,
  PeriodSubledgerLockV1Schema,
  PeriodCloseChecklistV1Schema,
  AccrualAmortizationScheduleV1Schema,
  AccrualAmortizationLineV1Schema,
  YearEndCloseRunV1Schema,
  FinancialForecastModelV1Schema,
  FinancialHealthRatiosV1Schema,
  StatementDrillThroughItemV1Schema,
} from './close.js';

describe('Period Close & Financial Forecasting Contracts (WI-OI-118)', () => {
  it('validates enums correctly', () => {
    expect(SUBLEDGER_TYPES).toContain('AP');
    expect(SUBLEDGER_TYPES).toContain('AR');
    expect(SUBLEDGER_TYPES).toContain('INVENTORY');
    expect(SUBLEDGER_TYPES).toContain('FIXED_ASSETS');
    expect(SUBLEDGER_TYPES).toContain('TREASURY');
    expect(SUBLEDGER_TYPES).toContain('GL');

    expect(SUBLEDGER_LOCK_STATUSES).toContain('OPEN');
    expect(SUBLEDGER_LOCK_STATUSES).toContain('SOFT_LOCKED');
    expect(SUBLEDGER_LOCK_STATUSES).toContain('HARD_LOCKED');

    expect(CHECKLIST_TASK_TYPES).toContain('BANK_RECONCILIATION');
    expect(CHECKLIST_TASK_TYPES).toContain('INVENTORY_VALUATION');
    expect(CHECKLIST_TASK_TYPES).toContain('DEPRECIATION_RUN');
    expect(CHECKLIST_TASK_TYPES).toContain('ACCRUAL_AMORTIZATION');
    expect(CHECKLIST_TASK_TYPES).toContain('TRIAL_BALANCE_VERIFICATION');

    expect(CHECKLIST_TASK_STATUSES).toContain('PENDING');
    expect(CHECKLIST_TASK_STATUSES).toContain('COMPLETED');

    expect(AMORTIZATION_TYPES).toContain('EXPENSE_ACCRUAL');
    expect(AMORTIZATION_TYPES).toContain('PREPAYMENT_AMORTIZATION');
    expect(AMORTIZATION_TYPES).toContain('DEFERRED_REVENUE_AMORTIZATION');
    expect(AMORTIZATION_STATUSES).toContain('ACTIVE');

    expect(YEAR_END_CLOSE_STATUSES).toContain('POSTED');
    expect(FORECAST_METHODS).toContain('BUDGET_ADJUSTED');
  });

  it('validates AccrualAmortizationLineV1Schema and FinancialForecastModelV1Schema', () => {
    const line = {
      id: 'a0000000-0000-4000-8000-000000000010',
      tenantId: 'tenant-acme',
      scheduleId: 'a0000000-0000-4000-8000-000000000003',
      periodNumber: 1,
      fiscalPeriodId: 'c0000000-0000-4000-8000-000000000001',
      scheduledDate: '2026-10-31',
      amountMinor: '10000',
      status: 'PENDING',
      glJournalId: null,
      autoReversalJournalId: null,
      postedAt: null,
      postedBy: null,
      reversedAt: null,
      reversedBy: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(AccrualAmortizationLineV1Schema.safeParse(line).success).toBe(true);

    const model = {
      id: 'a0000000-0000-4000-8000-000000000011',
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      modelName: 'Q4 Rolling Forecast',
      forecastMethod: 'BUDGET_ADJUSTED',
      basePeriodsCount: 3,
      growthRateBps: 500,
      inflationRateBps: 200,
      forecastHorizonPeriods: 12,
      includeCommitments: true,
      notes: 'Test model',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(FinancialForecastModelV1Schema.safeParse(model).success).toBe(true);
  });

  it('validates PeriodSubledgerLockV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      fiscalPeriodId: 'c0000000-0000-4000-8000-000000000001',
      subledgerType: 'AP',
      lockStatus: 'HARD_LOCKED',
      lockedAt: new Date().toISOString(),
      lockedBy: 'controller-1',
      unlockedAt: null,
      unlockedBy: null,
      notes: 'AP subledger closed for October',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(PeriodSubledgerLockV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates PeriodCloseChecklistV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000002',
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      fiscalPeriodId: 'c0000000-0000-4000-8000-000000000001',
      taskType: 'BANK_RECONCILIATION',
      taskName: 'Clear & Reconcile Bank Statements',
      taskStatus: 'COMPLETED',
      sequenceOrder: 1,
      dependsOnTaskType: null,
      completedAt: new Date().toISOString(),
      completedBy: 'treasurer-1',
      notes: 'All 3 accounts reconciled',
      evidenceRef: 'REC-2026-10-001',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(PeriodCloseChecklistV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates AccrualAmortizationScheduleV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000003',
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      scheduleNumber: 'SCH-PREPAY-001',
      scheduleName: 'Annual Software License',
      amortizationType: 'PREPAYMENT_AMORTIZATION',
      sourceDocumentType: 'AP_BILL',
      sourceDocumentRef: 'BILL-9821',
      totalAmountMinor: '120000', // $1,200.00
      recognizedAmountMinor: '10000', // $100.00
      remainingAmountMinor: '110000', // $1,100.00
      currencyCode: 'USD',
      expenseAccountId: 'd0000000-0000-4000-8000-000000000001',
      balanceSheetAccountId: 'd0000000-0000-4000-8000-000000000002',
      startPeriodId: 'c0000000-0000-4000-8000-000000000001',
      endPeriodId: null,
      periodsCount: 12,
      status: 'ACTIVE',
      autoReversal: false,
      notes: '12-month straight line',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(AccrualAmortizationScheduleV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates YearEndCloseRunV1Schema', () => {
    const valid = {
      id: 'a0000000-0000-4000-8000-000000000004',
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      fiscalYearId: 'e0000000-0000-4000-8000-000000000001',
      retainedEarningsAccountId: 'd0000000-0000-4000-8000-000000000003',
      totalRevenueMinor: '50000000', // $500,000.00
      totalExpenseMinor: '35000000', // $350,000.00
      netIncomeMinor: '15000000',    // $150,000.00
      currencyCode: 'USD',
      closingJournalId: 'f0000000-0000-4000-8000-000000000001',
      status: 'POSTED',
      previewSummary: { accountsZeroed: 14 },
      closedAt: new Date().toISOString(),
      closedBy: 'cfo-1',
      notes: 'FY2026 Year-End Close Completed',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(YearEndCloseRunV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates FinancialHealthRatiosV1Schema and StatementDrillThroughItemV1Schema', () => {
    const ratios = {
      tenantId: 'tenant-acme',
      accountingBookId: 'b0000000-0000-4000-8000-000000000001',
      fiscalPeriodId: 'c0000000-0000-4000-8000-000000000001',
      currentRatio: '2.45',
      quickRatio: '1.80',
      workingCapitalMinor: '4500000',
      debtToEquityRatio: '0.65',
      operatingMarginBps: 2250, // 22.5%
      computedAt: new Date().toISOString(),
    };
    expect(FinancialHealthRatiosV1Schema.safeParse(ratios).success).toBe(true);

    const drillThrough = {
      lineCode: 'BS-ASSET-CURRENT-AR',
      lineName: 'Accounts Receivable Trade',
      statementType: 'BALANCE_SHEET',
      accountId: 'd0000000-0000-4000-8000-000000000004',
      accountCode: '1100',
      accountName: 'Trade Receivables',
      accountType: 'ASSET',
      openingBalanceMinor: '1200000',
      debitMovementMinor: '450000',
      creditMovementMinor: '300000',
      closingBalanceMinor: '1350000',
      journalCount: 5,
      subledgerSourceCount: 5,
    };
    expect(StatementDrillThroughItemV1Schema.safeParse(drillThrough).success).toBe(true);
  });
});
