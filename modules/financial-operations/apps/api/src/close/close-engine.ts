import type {
  ForecastMethod,
  FinancialHealthRatiosV1,
} from '@gigalibs/contracts';

/**
 * Deterministic periodic distribution for accruals, prepayments & deferred revenue.
 * Guarantees 100% exact cent conservation using BigInt arithmetic only.
 */
export function distributeAmortization(
  totalMinorStr: string,
  periodsCount: number,
): string[] {
  if (periodsCount <= 0) {
    throw new Error('Periods count must be at least 1');
  }
  const total = BigInt(totalMinorStr);
  if (total < 0n) {
    throw new Error('Amortization total cannot be negative');
  }

  const count = BigInt(periodsCount);
  const base = total / count;
  const remainder = total - base * count;

  const lines: string[] = [];
  for (let i = 0; i < periodsCount; i++) {
    // Add remainder to the final period so that running recognized amounts follow uniform base
    const amount = i === periodsCount - 1 ? base + remainder : base;
    lines.push(amount.toString());
  }

  return lines;
}

export interface TemporaryAccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'REVENUE' | 'EXPENSE' | string;
  debitMinor: string;
  creditMinor: string;
}

export interface ZeroingJournalLine {
  accountId: string;
  debitAmountMinor: string;
  creditAmountMinor: string;
  description: string;
}

export interface YearEndRolloverCalculation {
  totalRevenueMinor: string;
  totalExpenseMinor: string;
  netIncomeMinor: string;
  zeroingLines: ZeroingJournalLine[];
}

/**
 * Calculates Year-End Retained Earnings rollover:
 * 1. Zeros out all temporary P&L accounts (Revenues credited -> debited to 0; Expenses debited -> credited to 0)
 * 2. Balances the voucher by transferring Net Income (Total Revenue - Total Expense) to Retained Earnings
 * 3. Enforces Debit == Credit balance invariant.
 */
export function computeYearEndRollover(
  accounts: TemporaryAccountBalance[],
  retainedEarningsAccountId: string,
): YearEndRolloverCalculation {
  let totalRevenue = 0n;
  let totalExpense = 0n;
  const zeroingLines: ZeroingJournalLine[] = [];

  for (const acc of accounts) {
    const dr = BigInt(acc.debitMinor || '0');
    const cr = BigInt(acc.creditMinor || '0');

    if (acc.accountType === 'REVENUE') {
      const netCredit = cr - dr;
      if (netCredit !== 0n) {
        totalRevenue += netCredit;
        // Zero out revenue: if credit > debit, debit the netCredit; else credit the deficit
        if (netCredit > 0n) {
          zeroingLines.push({
            accountId: acc.accountId,
            debitAmountMinor: netCredit.toString(),
            creditAmountMinor: '0',
            description: `Zeroing Revenue Account ${acc.accountCode}`,
          });
        } else {
          zeroingLines.push({
            accountId: acc.accountId,
            debitAmountMinor: '0',
            creditAmountMinor: (-netCredit).toString(),
            description: `Zeroing Revenue Account Deficit ${acc.accountCode}`,
          });
        }
      }
    } else if (acc.accountType === 'EXPENSE') {
      const netDebit = dr - cr;
      if (netDebit !== 0n) {
        totalExpense += netDebit;
        // Zero out expense: if debit > credit, credit the netDebit; else debit the surplus
        if (netDebit > 0n) {
          zeroingLines.push({
            accountId: acc.accountId,
            debitAmountMinor: '0',
            creditAmountMinor: netDebit.toString(),
            description: `Zeroing Expense Account ${acc.accountCode}`,
          });
        } else {
          zeroingLines.push({
            accountId: acc.accountId,
            debitAmountMinor: (-netDebit).toString(),
            creditAmountMinor: '0',
            description: `Zeroing Expense Credit Surplus ${acc.accountCode}`,
          });
        }
      }
    }
  }

  const netIncome = totalRevenue - totalExpense;

  // Add the Retained Earnings balancing line
  if (netIncome > 0n) {
    // Net profit: Credit Retained Earnings (Equity increases)
    zeroingLines.push({
      accountId: retainedEarningsAccountId,
      debitAmountMinor: '0',
      creditAmountMinor: netIncome.toString(),
      description: 'Transfer Net Income to Retained Earnings',
    });
  } else if (netIncome < 0n) {
    // Net loss: Debit Retained Earnings (Equity decreases)
    zeroingLines.push({
      accountId: retainedEarningsAccountId,
      debitAmountMinor: (-netIncome).toString(),
      creditAmountMinor: '0',
      description: 'Transfer Net Loss to Retained Earnings',
    });
  }

  // Verify balanced voucher invariant: Sum(Debits) === Sum(Credits)
  let totalDebits = 0n;
  let totalCredits = 0n;
  for (const line of zeroingLines) {
    totalDebits += BigInt(line.debitAmountMinor);
    totalCredits += BigInt(line.creditAmountMinor);
  }

  if (totalDebits !== totalCredits) {
    throw new Error(
      `Year-end rollover voucher out of balance: Debits ${totalDebits} != Credits ${totalCredits}`,
    );
  }

  return {
    totalRevenueMinor: totalRevenue.toString(),
    totalExpenseMinor: totalExpense.toString(),
    netIncomeMinor: netIncome.toString(),
    zeroingLines,
  };
}

export interface ForecastCalculationParams {
  historicalActualsMinor: string[];
  horizonPeriods: number;
  method: ForecastMethod;
  growthRateBps?: number;
  inflationRateBps?: number;
  activeCommitmentMinor?: string;
}

export interface ForecastPeriodProjection {
  projectionPeriodIndex: number;
  baselineMinor: string;
  forecastMinor: string;
  encumbranceAdjustedMinor: string;
  confidenceLowMinor: string;
  confidenceHighMinor: string;
}

/**
 * Computes multi-period financial forecasting projections.
 */
export function computeRollingForecast(
  params: ForecastCalculationParams,
): ForecastPeriodProjection[] {
  const actuals = params.historicalActualsMinor.map((x) => BigInt(x || '0'));
  const count = actuals.length;

  let baseline = 0n;
  if (count === 0) {
    baseline = 0n;
  } else if (params.method === 'WEIGHTED_MOVING_AVG' && count >= 3) {
    // 50% most recent, 30% second most recent, 20% third
    const a1 = actuals[count - 1]!;
    const a2 = actuals[count - 2]!;
    const a3 = actuals[count - 3]!;
    baseline = (a1 * 50n + a2 * 30n + a3 * 20n) / 100n;
  } else {
    // Historical run-rate: simple arithmetic mean
    const sum = actuals.reduce((acc, val) => acc + val, 0n);
    baseline = sum / BigInt(count);
  }

  const growthBps = BigInt(params.growthRateBps || 0);
  const inflationBps = BigInt(params.inflationRateBps || 0);
  const activeCommitment = BigInt(params.activeCommitmentMinor || '0');

  const projections: ForecastPeriodProjection[] = [];

  for (let i = 1; i <= params.horizonPeriods; i++) {
    // Compound growth per period index: (1 + (growth + inflation) / 10000)
    const factor = 10000n + growthBps + inflationBps;
    const forecast = (baseline * factor) / 10000n;
    const encumbranceAdjusted = forecast + (i === 1 ? activeCommitment : 0n);

    // 5% confidence bands
    const confidenceLow = (encumbranceAdjusted * 9500n) / 10000n;
    const confidenceHigh = (encumbranceAdjusted * 10500n) / 10000n;

    projections.push({
      projectionPeriodIndex: i,
      baselineMinor: baseline.toString(),
      forecastMinor: forecast.toString(),
      encumbranceAdjustedMinor: encumbranceAdjusted.toString(),
      confidenceLowMinor: confidenceLow.toString(),
      confidenceHighMinor: confidenceHigh.toString(),
    });
  }

  return projections;
}

export interface FinancialHealthParams {
  tenantId: string;
  accountingBookId: string;
  fiscalPeriodId: string;
  currentAssetsMinorStr: string;
  currentLiabilitiesMinorStr: string;
  cashMinorStr: string;
  arMinorStr: string;
  totalLiabilitiesMinorStr: string;
  totalEquityMinorStr: string;
  operatingIncomeMinorStr: string;
  revenueMinorStr: string;
}

/**
 * Computes exact financial health indicators & ratios.
 */
export function computeFinancialHealthRatios(
  params: FinancialHealthParams,
): FinancialHealthRatiosV1 {
  const ca = BigInt(params.currentAssetsMinorStr || '0');
  const cl = BigInt(params.currentLiabilitiesMinorStr || '0');
  const cash = BigInt(params.cashMinorStr || '0');
  const ar = BigInt(params.arMinorStr || '0');
  const tl = BigInt(params.totalLiabilitiesMinorStr || '0');
  const te = BigInt(params.totalEquityMinorStr || '0');
  const opIncome = BigInt(params.operatingIncomeMinorStr || '0');
  const rev = BigInt(params.revenueMinorStr || '0');

  // Working Capital = CA - CL
  const workingCapital = ca - cl;

  // Format scaled ratio helper (scale by 100 for 2 decimal places)
  const formatRatio = (numerator: bigint, denominator: bigint): string => {
    if (denominator === 0n) return 'N/A';
    const scaled = (numerator * 100n) / denominator;
    const integerPart = scaled / 100n;
    const fractionalPart = (scaled < 0n ? -scaled : scaled) % 100n;
    return `${integerPart}.${fractionalPart.toString().padStart(2, '0')}`;
  };

  const currentRatio = formatRatio(ca, cl);
  const quickRatio = formatRatio(cash + ar, cl);
  const debtToEquity = formatRatio(tl, te);

  // Operating margin in basis points (e.g. 2000 bps = 20%)
  const operatingMarginBps = rev !== 0n ? Number((opIncome * 10000n) / rev) : 0;

  return {
    tenantId: params.tenantId,
    accountingBookId: params.accountingBookId,
    fiscalPeriodId: params.fiscalPeriodId,
    currentRatio,
    quickRatio,
    workingCapitalMinor: workingCapital.toString(),
    debtToEquityRatio: debtToEquity,
    operatingMarginBps,
    computedAt: new Date().toISOString(),
  };
}
