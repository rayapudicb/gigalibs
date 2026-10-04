import { describe, it, expect } from 'vitest';
import {
  distributeAmortization,
  computeYearEndRollover,
  computeRollingForecast,
  computeFinancialHealthRatios,
} from './close-engine.js';

describe('Period Close & Financial Forecasting Engine (WI-OI-118)', () => {
  it('distributes amortization with exact cent conservation', () => {
    // Exact divisible
    const lines1 = distributeAmortization('120000', 12);
    expect(lines1).toHaveLength(12);
    expect(lines1.every((l) => l === '10000')).toBe(true);
    const sum1 = lines1.reduce((acc, l) => acc + BigInt(l), 0n);
    expect(sum1).toBe(120000n);

    // Non-divisible: remainder 1 cent allocated to last period
    const lines2 = distributeAmortization('10000', 3);
    expect(lines2).toHaveLength(3);
    expect(lines2[0]).toBe('3333');
    expect(lines2[1]).toBe('3333');
    expect(lines2[2]).toBe('3334');
    const sum2 = lines2.reduce((acc, l) => acc + BigInt(l), 0n);
    expect(sum2).toBe(10000n);
  });

  it('computes year-end rollover for net income and balances voucher', () => {
    const retainedEarningsId = 're-acct-001';
    const accounts = [
      {
        accountId: 'rev-01',
        accountCode: '4000',
        accountName: 'Sales Revenue',
        accountType: 'REVENUE',
        debitMinor: '0',
        creditMinor: '50000000', // $500,000.00
      },
      {
        accountId: 'rev-02',
        accountCode: '4100',
        accountName: 'Service Revenue',
        accountType: 'REVENUE',
        debitMinor: '0',
        creditMinor: '10000000', // $100,000.00
      },
      {
        accountId: 'exp-01',
        accountCode: '5000',
        accountName: 'Cost of Goods Sold',
        accountType: 'EXPENSE',
        debitMinor: '30000000', // $300,000.00
        creditMinor: '0',
      },
      {
        accountId: 'exp-02',
        accountCode: '6000',
        accountName: 'Salaries Expense',
        accountType: 'EXPENSE',
        debitMinor: '15000000', // $150,000.00
        creditMinor: '0',
      },
    ];

    const result = computeYearEndRollover(accounts, retainedEarningsId);

    expect(result.totalRevenueMinor).toBe('60000000');
    expect(result.totalExpenseMinor).toBe('45000000');
    expect(result.netIncomeMinor).toBe('15000000'); // $150,000 profit

    // Check balancing
    let totalDr = 0n;
    let totalCr = 0n;
    for (const line of result.zeroingLines) {
      totalDr += BigInt(line.debitAmountMinor);
      totalCr += BigInt(line.creditAmountMinor);
    }
    expect(totalDr).toBe(60000000n);
    expect(totalCr).toBe(60000000n);
    expect(totalDr).toBe(totalCr);

    // Retained Earnings should be credited by Net Income
    const reLine = result.zeroingLines.find((l) => l.accountId === retainedEarningsId);
    expect(reLine).toBeDefined();
    expect(reLine?.creditAmountMinor).toBe('15000000');
    expect(reLine?.debitAmountMinor).toBe('0');
  });

  it('computes year-end rollover for net loss and debits retained earnings', () => {
    const retainedEarningsId = 're-acct-001';
    const accounts = [
      {
        accountId: 'rev-01',
        accountCode: '4000',
        accountName: 'Revenue',
        accountType: 'REVENUE',
        debitMinor: '0',
        creditMinor: '20000000', // $200,000.00
      },
      {
        accountId: 'exp-01',
        accountCode: '6000',
        accountName: 'Expenses',
        accountType: 'EXPENSE',
        debitMinor: '25000000', // $250,000.00
        creditMinor: '0',
      },
    ];

    const result = computeYearEndRollover(accounts, retainedEarningsId);

    expect(result.netIncomeMinor).toBe('-5000000'); // $50,000 loss

    // Retained Earnings should be debited by $50,000
    const reLine = result.zeroingLines.find((l) => l.accountId === retainedEarningsId);
    expect(reLine).toBeDefined();
    expect(reLine?.debitAmountMinor).toBe('5000000');
    expect(reLine?.creditAmountMinor).toBe('0');

    // Debits and Credits still balance
    let totalDr = 0n;
    let totalCr = 0n;
    for (const line of result.zeroingLines) {
      totalDr += BigInt(line.debitAmountMinor);
      totalCr += BigInt(line.creditAmountMinor);
    }
    expect(totalDr).toBe(25000000n);
    expect(totalCr).toBe(25000000n);
  });

  it('computes rolling forecast projections with growth and commitments', () => {
    const actuals = ['1000000', '1200000', '1400000']; // $10k, $12k, $14k
    const projections = computeRollingForecast({
      historicalActualsMinor: actuals,
      horizonPeriods: 3,
      method: 'WEIGHTED_MOVING_AVG',
      growthRateBps: 500, // 5% growth
      inflationRateBps: 200, // 2% inflation
      activeCommitmentMinor: '300000', // $3,000 PO encumbrance
    });

    expect(projections).toHaveLength(3);
    // Weighted baseline: (1400000*50 + 1200000*30 + 1000000*20)/100 = (70m + 36m + 20m)/100 = 1260000
    expect(projections[0]?.baselineMinor).toBe('1260000');
    // Factor = 10000 + 500 + 200 = 10700 (1.07x) -> 1260000 * 10700 / 10000 = 1348200
    expect(projections[0]?.forecastMinor).toBe('1348200');
    // Period 1 includes active commitment: 1348200 + 300000 = 1648200
    expect(projections[0]?.encumbranceAdjustedMinor).toBe('1648200');
    // Period 2 has no period 1 commitment added:
    expect(projections[1]?.encumbranceAdjustedMinor).toBe('1348200');
  });

  it('computes financial health ratios accurately', () => {
    const ratios = computeFinancialHealthRatios({
      tenantId: 'tenant-test',
      accountingBookId: 'book-01',
      fiscalPeriodId: 'period-01',
      currentAssetsMinorStr: '25000000', // $250,000.00
      currentLiabilitiesMinorStr: '10000000', // $100,000.00
      cashMinorStr: '6000000', // $60,000.00
      arMinorStr: '9000000', // $90,000.00
      totalLiabilitiesMinorStr: '12000000',
      totalEquityMinorStr: '20000000',
      operatingIncomeMinorStr: '4000000',
      revenueMinorStr: '20000000',
    });

    expect(ratios.currentRatio).toBe('2.50');
    expect(ratios.quickRatio).toBe('1.50'); // (60k + 90k) / 100k = 1.50
    expect(ratios.workingCapitalMinor).toBe('15000000'); // 250k - 100k = 150k
    expect(ratios.debtToEquityRatio).toBe('0.60'); // 120k / 200k = 0.60
    expect(ratios.operatingMarginBps).toBe(2000); // 40k / 200k = 20% = 2000 bps
  });
});
