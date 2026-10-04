import { describe, expect, it } from 'vitest';
import {
  BankAccountV1Schema,
  BankStatementV1Schema,
  BankStatementLineV1Schema,
  BankReconciliationSessionV1Schema,
  CreateBankAccountInputV1Schema,
  ImportBankStatementInputV1Schema,
  AutoMatchInputV1Schema,
} from './treasury.js';

describe('Treasury & Bank Reconciliation Contracts', () => {
  const tenantId = 't-corp-01';

  it('validates BankAccountV1Schema with complete properties', () => {
    const validAccount = {
      id: '11111111-1111-4111-a111-111111111111',
      tenantId,
      accountName: 'Operating Checking Account',
      accountNumber: 'US1234567890',
      routingCode: '121000358',
      iban: 'US64SVBKUS6S3300958879',
      swiftBic: 'SVBKUS6S',
      currencyCode: 'USD',
      glCashAccountId: '22222222-2222-4222-a222-222222222222',
      currentClearedBalanceMinor: '150000000',
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'admin',
      updatedBy: null,
    };

    const parsed = BankAccountV1Schema.parse(validAccount);
    expect(parsed.accountName).toBe('Operating Checking Account');
    expect(parsed.currencyCode).toBe('USD');
  });

  it('validates BankStatementV1Schema and lines', () => {
    const statement = {
      id: '33333333-3333-4333-a333-333333333333',
      tenantId,
      bankAccountId: '11111111-1111-4111-a111-111111111111',
      statementNumber: 'STMT-2026-10-001',
      statementDate: '2026-10-04',
      openingBalanceMinor: '10000000',
      closingBalanceMinor: '12500000',
      format: 'CAMT053',
      sourceChecksum: 'a'.repeat(64),
      status: 'IMPORTED',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = BankStatementV1Schema.parse(statement);
    expect(parsed.statementNumber).toBe('STMT-2026-10-001');
    expect(parsed.format).toBe('CAMT053');
  });

  it('validates BankStatementLineV1Schema credit and debit', () => {
    const line = {
      id: '44444444-4444-4444-a444-444444444444',
      tenantId,
      statementId: '33333333-3333-4333-a333-333333333333',
      lineNumber: 1,
      transactionDate: '2026-10-03',
      valueDate: '2026-10-04',
      amountMinor: '2500000',
      transactionType: 'CREDIT',
      reference: 'INV-100293',
      checkNumber: null,
      counterpartyName: 'Acme Global Corp',
      counterpartyAccount: 'GB29NWBK60161331926819',
      description: 'Customer wire settlement',
      matchStatus: 'UNMATCHED',
      matchedAt: null,
      createdAt: new Date().toISOString(),
    };

    const parsed = BankStatementLineV1Schema.parse(line);
    expect(parsed.amountMinor).toBe('2500000');
    expect(parsed.transactionType).toBe('CREDIT');
  });

  it('validates BankReconciliationSessionV1Schema', () => {
    const session = {
      id: '55555555-5555-4555-a555-555555555555',
      tenantId,
      bankAccountId: '11111111-1111-4111-a111-111111111111',
      statementId: '33333333-3333-4333-a333-333333333333',
      reconciliationDate: '2026-10-04',
      statementEndingBalanceMinor: '12500000',
      clearedBookBalanceMinor: '12500000',
      unreconciledDifferenceMinor: '0',
      status: 'BALANCED',
      sealHash: null,
      sealedAt: null,
      sealedBy: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = BankReconciliationSessionV1Schema.parse(session);
    expect(parsed.unreconciledDifferenceMinor).toBe('0');
    expect(parsed.status).toBe('BALANCED');
  });

  it('validates input DTOs', () => {
    const createAccount = CreateBankAccountInputV1Schema.parse({
      accountName: 'Payroll Reserve Account',
      accountNumber: '987654321',
      currencyCode: 'USD',
      glCashAccountId: '22222222-2222-4222-a222-222222222222',
      initialBalanceMinor: '5000000',
    });
    expect(createAccount.accountName).toBe('Payroll Reserve Account');

    const autoMatch = AutoMatchInputV1Schema.parse({
      reconciliationId: '55555555-5555-4555-a555-555555555555',
      dateToleranceDays: 5,
    });
    expect(autoMatch.dateToleranceDays).toBe(5);

    const importInput = ImportBankStatementInputV1Schema.parse({
      bankAccountId: '11111111-1111-4111-a111-111111111111',
      statementNumber: 'STMT-001',
      statementDate: '2026-10-04',
      openingBalanceMinor: '1000',
      closingBalanceMinor: '2000',
      format: 'CSV',
      rawContent: 'Date,Amount,Reference\n2026-10-04,1000,REF1',
      parsedLines: [
        {
          lineNumber: 1,
          transactionDate: '2026-10-04',
          valueDate: '2026-10-04',
          amountMinor: '1000',
          transactionType: 'CREDIT',
          reference: 'REF1',
          checkNumber: null,
          counterpartyName: null,
          counterpartyAccount: null,
          description: 'Payment',
        },
      ],
    });
    expect(importInput.statementNumber).toBe('STMT-001');
  });
});
