import { describe, expect, it } from 'vitest';
import {
  translateAmount,
  determineRateForAccount,
  translateTrialBalance,
  RATE_SCALE,
  type TrialBalanceLineInput,
  type FxRatesInput,
} from './fx-translation-engine.js';

describe('IAS 21 FX Translation Engine', () => {
  it('translates amounts deterministically with exact integer scaling', () => {
    // 100.00 GBP at 1.300000 USD/GBP -> 130.00 USD
    const gbpMinor = 10000n;
    const rateScaled = 1300000n; // 1.300000 * 1,000,000
    const usdMinor = translateAmount(gbpMinor, rateScaled);
    expect(usdMinor).toBe(13000n);

    // 0 amount
    expect(translateAmount(0n, rateScaled)).toBe(0n);
  });

  it('determines appropriate rate according to IAS 21 account classifications', () => {
    const rates: FxRatesInput = {
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      closingRateScaled: 1350000n, // BS rate
      averageRateScaled: 1300000n, // P&L rate
      historicalRateScaled: 1250000n, // Equity rate
    };

    expect(determineRateForAccount('ASSET', rates)).toEqual({
      rateType: 'CLOSING',
      rateScaled: 1350000n,
    });
    expect(determineRateForAccount('LIABILITY', rates)).toEqual({
      rateType: 'CLOSING',
      rateScaled: 1350000n,
    });
    expect(determineRateForAccount('REVENUE', rates)).toEqual({
      rateType: 'AVERAGE',
      rateScaled: 1300000n,
    });
    expect(determineRateForAccount('EXPENSE', rates)).toEqual({
      rateType: 'AVERAGE',
      rateScaled: 1300000n,
    });
    expect(determineRateForAccount('EQUITY', rates)).toEqual({
      rateType: 'HISTORICAL',
      rateScaled: 1250000n,
    });
  });

  it('translates a full trial balance and balances via CTA equity adjustment', () => {
    const rates: FxRatesInput = {
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      closingRateScaled: 1300000n, // 1.30
      averageRateScaled: 1250000n, // 1.25
      historicalRateScaled: 1200000n, // 1.20
    };

    // Subsidiary balanced TB in GBP:
    // Cash (Asset): Debit 100,000 GBP
    // AR (Asset): Debit 50,000 GBP
    // Common Stock (Equity): Credit 80,000 GBP
    // Retained Earnings (Equity): Credit 20,000 GBP
    // Revenue (Revenue): Credit 150,000 GBP
    // COGS (Expense): Debit 100,000 GBP
    // Total Debit = 250,000 GBP, Total Credit = 250,000 GBP
    const tb: TrialBalanceLineInput[] = [
      {
        glAccountId: '11111111-1111-4111-a111-111111111111',
        accountCode: '1010',
        accountName: 'Cash',
        accountType: 'ASSET',
        currencyCode: 'GBP',
        debitMinor: 10000000n,
        creditMinor: 0n,
      },
      {
        glAccountId: '22222222-2222-4222-a222-222222222222',
        accountCode: '1200',
        accountName: 'Accounts Receivable',
        accountType: 'ASSET',
        currencyCode: 'GBP',
        debitMinor: 5000000n,
        creditMinor: 0n,
      },
      {
        glAccountId: '33333333-3333-4333-a333-333333333333',
        accountCode: '3010',
        accountName: 'Common Stock',
        accountType: 'EQUITY',
        currencyCode: 'GBP',
        debitMinor: 0n,
        creditMinor: 8000000n,
      },
      {
        glAccountId: '44444444-4444-4444-a444-444444444444',
        accountCode: '3900',
        accountName: 'Retained Earnings',
        accountType: 'EQUITY',
        currencyCode: 'GBP',
        debitMinor: 0n,
        creditMinor: 2000000n,
      },
      {
        glAccountId: '55555555-5555-4555-a555-555555555555',
        accountCode: '4010',
        accountName: 'Sales Revenue',
        accountType: 'REVENUE',
        currencyCode: 'GBP',
        debitMinor: 0n,
        creditMinor: 15000000n,
      },
      {
        glAccountId: '66666666-6666-4666-a666-666666666666',
        accountCode: '5010',
        accountName: 'Cost of Goods Sold',
        accountType: 'EXPENSE',
        currencyCode: 'GBP',
        debitMinor: 10000000n,
        creditMinor: 0n,
      },
    ];

    const res = translateTrialBalance(tb, rates, 'USD');

    // Local totals equal 250,000.00
    expect(res.totalSubsidiaryDebitMinor).toBe(25000000n);
    expect(res.totalSubsidiaryCreditMinor).toBe(25000000n);

    // Translated debits:
    // Cash: 100,000 * 1.30 = 130,000
    // AR: 50,000 * 1.30 = 65,000
    // COGS: 100,000 * 1.25 = 125,000
    // Total Translated Debits = 320,000 USD
    expect(res.totalTranslatedDebitMinor).toBe(32000000n);

    // Translated credits:
    // Common Stock: 80,000 * 1.20 = 96,000
    // Retained Earnings: 20,000 * 1.20 = 24,000
    // Revenue: 150,000 * 1.25 = 187,500
    // Total Translated Credits = 307,500 USD
    expect(res.totalTranslatedCreditMinor).toBe(30750000n);

    // CTA adjustment: 320,000 - 307,500 = 12,500 USD Credit to equity
    expect(res.ctaAmountMinor).toBe(1250000n);
    expect(res.ctaIsCredit).toBe(true);
    expect(res.isBalanced).toBe(true);
  });
});
