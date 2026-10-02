import { describe, expect, it } from 'vitest';
import {
  CreateWfoExpenseReportV1Schema,
  AddWfoExpenseLineV1Schema,
  VerifyWfoExpenseLineV1Schema,
  WfoGlJournalBatchV1Schema,
} from '@gigalibs/contracts';

describe('Universal Expenses & ERP GL Batch Integration', () => {
  it('validates expense report creation', () => {
    const input = {
      title: 'Production Run - July 2026 Crew Travel',
      notes: 'Mileage and equipment rentals for on-site staff',
    };
    const parsed = CreateWfoExpenseReportV1Schema.parse(input);
    expect(parsed.title).toBe('Production Run - July 2026 Crew Travel');
  });

  it('validates mileage and receipt expense lines', () => {
    const mileageLine = {
      expenseType: 'MILEAGE',
      amount: 67.0,
      mileageFrom: 'Downtown Warehouse',
      mileageTo: 'Convention Center',
      miles: 100.0,
      description: 'Equipment transport drive',
    };
    const parsedMileage = AddWfoExpenseLineV1Schema.parse(mileageLine);
    expect(parsedMileage.miles).toBe(100.0);

    const receiptLine = {
      expenseType: 'EQUIPMENT',
      amount: 450.0,
      receiptUrl: 'https://storage.local/receipts/rental-invoice-992.pdf',
      description: 'Audio monitors rental',
    };
    const parsedReceipt = AddWfoExpenseLineV1Schema.parse(receiptLine);
    expect(parsedReceipt.receiptUrl).toBe('https://storage.local/receipts/rental-invoice-992.pdf');
  });

  it('validates expense verification decision', () => {
    const decision = VerifyWfoExpenseLineV1Schema.parse({
      decision: 'APPROVE',
    });
    expect(decision.decision).toBe('APPROVE');
  });

  it('validates ERP / iDempiere GL journal batch contract', () => {
    const batch = {
      batchNo: 'GL-BATCH-20260715',
      period: '2026-07-15',
      totalDebit: 15000.0,
      totalCredit: 15000.0,
      currency: 'USD',
      isBalanced: true,
      lines: [
        {
          lineNo: 1,
          accountCode: '51000-LABOR',
          accountName: 'Direct Labor Expense - Event Crewe',
          debitAmount: 15000.0,
          creditAmount: 0,
          currency: 'USD',
          description: 'Direct Labor Payroll',
        },
        {
          lineNo: 2,
          accountCode: '21000-PAYROLL-CLEARING',
          accountName: 'Payroll Clearing Account',
          debitAmount: 0,
          creditAmount: 15000.0,
          currency: 'USD',
          description: 'Payroll offset',
        },
      ],
      generatedAt: '2026-07-15T18:00:00.000Z',
    };
    const parsedBatch = WfoGlJournalBatchV1Schema.parse(batch);
    expect(parsedBatch.isBalanced).toBe(true);
    expect(parsedBatch.lines).toHaveLength(2);
  });
});
