import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AccountingBookV1Schema,
  AccountV1Schema,
  FiscalYearV1Schema,
  FiscalPeriodV1Schema,
  JournalV1Schema,
  PostJournalInputV1Schema,
  TrialBalanceReportV1Schema,
  BalanceSheetReportV1Schema,
  IncomeStatementReportV1Schema,
  JournalPostedEventV1Schema,
} from './finance.js';

describe('Financial Operations Contracts', () => {
  const tenantId = 'tenant-test-corp-01';
  const bookId = randomUUID();
  const yearId = randomUUID();
  const periodId = randomUUID();
  const assetAccountId = randomUUID();
  const revAccountId = randomUUID();

  it('validates AccountingBookV1Schema correctly', () => {
    const book = {
      id: bookId,
      tenantId,
      bookCode: 'GAAP',
      bookName: 'Primary US GAAP Book',
      legalEntityPartyId: randomUUID(),
      currencyCode: 'USD',
      costingMethod: 'STANDARD',
      isPrimary: true,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = AccountingBookV1Schema.safeParse(book);
    expect(parsed.success).toBe(true);
  });

  it('validates AccountV1Schema correctly', () => {
    const account = {
      id: assetAccountId,
      tenantId,
      accountingBookId: bookId,
      accountCode: '1000.CASH',
      accountName: 'Operating Cash',
      accountClass: 'ASSET',
      accountSubtype: 'BANK',
      normalBalance: 'DEBIT',
      isReconcilable: true,
      isSubledgerControl: false,
      isSystemReserved: false,
      active: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = AccountV1Schema.safeParse(account);
    expect(parsed.success).toBe(true);
  });

  it('validates FiscalYear and FiscalPeriod schemas correctly', () => {
    const year = {
      id: yearId,
      tenantId,
      accountingBookId: bookId,
      yearName: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(FiscalYearV1Schema.safeParse(year).success).toBe(true);

    const period = {
      id: periodId,
      tenantId,
      fiscalYearId: yearId,
      accountingBookId: bookId,
      periodNumber: 1,
      periodName: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'OPEN',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(FiscalPeriodV1Schema.safeParse(period).success).toBe(true);
  });

  it('validates JournalV1Schema and balanced PostJournalInputV1Schema', () => {
    const postInput = {
      accountingBookId: bookId,
      fiscalPeriodId: periodId,
      postingDate: '2026-01-15',
      entryType: 'STANDARD_MANUAL',
      description: 'Opening Cash Contribution',
      lines: [
        {
          accountId: assetAccountId,
          debitAmountMinor: '500000',
          creditAmountMinor: '0',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          memo: 'Debit Cash',
        },
        {
          accountId: revAccountId,
          debitAmountMinor: '0',
          creditAmountMinor: '500000',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          memo: 'Credit Equity / Contribution',
        },
      ],
    };
    expect(PostJournalInputV1Schema.safeParse(postInput).success).toBe(true);

    const journal = {
      id: randomUUID(),
      tenantId,
      journalNumber: 'JV-2026-0001',
      accountingBookId: bookId,
      fiscalPeriodId: periodId,
      postingDate: '2026-01-15',
      entryType: 'STANDARD_MANUAL',
      description: 'Opening Cash Contribution',
      status: 'POSTED',
      totalDebitMinor: '500000',
      totalCreditMinor: '500000',
      lines: [
        {
          id: randomUUID(),
          tenantId,
          journalId: randomUUID(),
          lineNumber: 1,
          accountId: assetAccountId,
          debitAmountMinor: '500000',
          creditAmountMinor: '0',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          baseDebitAmountMinor: '500000',
          baseCreditAmountMinor: '0',
          memo: 'Debit Cash',
          createdAt: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          tenantId,
          journalId: randomUUID(),
          lineNumber: 2,
          accountId: revAccountId,
          debitAmountMinor: '0',
          creditAmountMinor: '500000',
          currencyCode: 'USD',
          exchangeRate: '1.000000',
          baseDebitAmountMinor: '0',
          baseCreditAmountMinor: '500000',
          memo: 'Credit Equity',
          createdAt: new Date().toISOString(),
        },
      ],
      version: 1,
      postedAt: new Date().toISOString(),
      postedBy: 'chief-accountant-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(JournalV1Schema.safeParse(journal).success).toBe(true);
  });

  it('validates financial reports schemas', () => {
    const trialBalance = {
      accountingBookId: bookId,
      bookCode: 'GAAP',
      currencyCode: 'USD',
      asOfDate: '2026-01-31',
      lines: [
        {
          accountId: assetAccountId,
          accountCode: '1000',
          accountName: 'Operating Cash',
          accountClass: 'ASSET',
          accountSubtype: 'BANK',
          normalBalance: 'DEBIT',
          debitTurnoverMinor: '500000',
          creditTurnoverMinor: '0',
          endingDebitMinor: '500000',
          endingCreditMinor: '0',
        },
      ],
      totalDebitsMinor: '500000',
      totalCreditsMinor: '500000',
      isBalanced: true,
    };
    expect(TrialBalanceReportV1Schema.safeParse(trialBalance).success).toBe(true);

    const balanceSheet = {
      accountingBookId: bookId,
      bookCode: 'GAAP',
      currencyCode: 'USD',
      asOfDate: '2026-01-31',
      assets: {
        totalMinor: '500000',
        sections: [
          {
            sectionName: 'Current Assets',
            totalMinor: '500000',
            items: [
              {
                accountId: assetAccountId,
                accountCode: '1000',
                accountName: 'Operating Cash',
                amountMinor: '500000',
              },
            ],
          },
        ],
      },
      liabilities: {
        totalMinor: '0',
        sections: [],
      },
      equity: {
        totalMinor: '500000',
        sections: [],
      },
      isBalanced: true,
    };
    expect(BalanceSheetReportV1Schema.safeParse(balanceSheet).success).toBe(true);

    const incomeStatement = {
      accountingBookId: bookId,
      bookCode: 'GAAP',
      currencyCode: 'USD',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      revenues: {
        totalMinor: '1000000',
        items: [],
      },
      costOfGoodsSold: {
        totalMinor: '400000',
        items: [],
      },
      grossProfitMinor: '600000',
      operatingExpenses: {
        totalMinor: '200000',
        items: [],
      },
      operatingIncomeMinor: '400000',
      netIncomeMinor: '400000',
    };
    expect(IncomeStatementReportV1Schema.safeParse(incomeStatement).success).toBe(true);
  });

  it('validates JournalPostedEventV1Schema', () => {
    const event = {
      specversion: '1.0',
      id: randomUUID(),
      source: 'gigalibs.financial-operations',
      type: 'finance.journal.posted.v1',
      tenantId,
      subject: `journals/${randomUUID()}`,
      time: new Date().toISOString(),
      correlationId: 'tx-001',
      data: {
        journalId: randomUUID(),
        journalNumber: 'JV-2026-0001',
        accountingBookId: bookId,
        fiscalPeriodId: periodId,
        postingDate: '2026-01-15',
        entryType: 'STANDARD_MANUAL',
        totalDebitMinor: '500000',
        totalCreditMinor: '500000',
        postedAt: new Date().toISOString(),
        postedBy: 'chief-accountant-01',
      },
    };
    expect(JournalPostedEventV1Schema.safeParse(event).success).toBe(true);
  });
});
