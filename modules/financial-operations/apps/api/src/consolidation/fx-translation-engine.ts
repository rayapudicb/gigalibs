/**
 * IAS 21 / ASC 830 Multi-Currency Translation Engine
 * Translates subsidiary trial balances to group reporting currency
 * using exact integer arithmetic (scaled by 1,000,000). Zero floating-point math.
 */

export const RATE_SCALE = 1_000_000n;

export type FxRateType = 'CLOSING' | 'AVERAGE' | 'HISTORICAL' | 'ONE_TO_ONE';

export interface TrialBalanceLineInput {
  glAccountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  currencyCode: string;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface FxRatesInput {
  fromCurrency: string;
  toCurrency: string;
  closingRateScaled: bigint;
  averageRateScaled: bigint;
  historicalRateScaled: bigint;
}

export interface TranslatedTrialBalanceLine {
  glAccountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  localCurrency: string;
  localDebitMinor: bigint;
  localCreditMinor: bigint;
  fxRateType: FxRateType;
  fxRateAppliedScaled: bigint;
  reportingCurrency: string;
  reportingDebitMinor: bigint;
  reportingCreditMinor: bigint;
}

export interface TranslationResult {
  lines: TranslatedTrialBalanceLine[];
  totalSubsidiaryDebitMinor: bigint;
  totalSubsidiaryCreditMinor: bigint;
  totalTranslatedDebitMinor: bigint;
  totalTranslatedCreditMinor: bigint;
  ctaAmountMinor: bigint;
  ctaIsCredit: boolean;
  isBalanced: boolean;
}

/**
 * Translates a monetary amount in minor units with scaled exchange rate.
 * Formula: (amountMinor * rateScaled) / RATE_SCALE
 */
export function translateAmount(amountMinor: bigint, rateScaled: bigint): bigint {
  if (amountMinor === 0n || rateScaled === 0n) return 0n;
  return (amountMinor * rateScaled) / RATE_SCALE;
}

/**
 * Determines appropriate IAS 21 FX rate type and applied rate based on account class.
 */
export function determineRateForAccount(
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  rates: FxRatesInput,
): { rateType: FxRateType; rateScaled: bigint } {
  switch (accountType) {
    case 'ASSET':
    case 'LIABILITY':
      return { rateType: 'CLOSING', rateScaled: rates.closingRateScaled };
    case 'REVENUE':
    case 'EXPENSE':
      return { rateType: 'AVERAGE', rateScaled: rates.averageRateScaled };
    case 'EQUITY':
    default:
      return { rateType: 'HISTORICAL', rateScaled: rates.historicalRateScaled };
  }
}

/**
 * Translates an entire subsidiary trial balance and computes Cumulative Translation Adjustment (CTA).
 */
export function translateTrialBalance(
  lines: TrialBalanceLineInput[],
  rates: FxRatesInput | null,
  reportingCurrency: string,
): TranslationResult {
  let totalSubDebit = 0n;
  let totalSubCredit = 0n;
  let totalTransDebit = 0n;
  let totalTransCredit = 0n;

  const translatedLines: TranslatedTrialBalanceLine[] = [];

  for (const line of lines) {
    totalSubDebit += line.debitMinor;
    totalSubCredit += line.creditMinor;

    let rateType: FxRateType = 'ONE_TO_ONE';
    let rateScaled = RATE_SCALE;

    if (line.currencyCode !== reportingCurrency) {
      if (!rates) {
        throw new Error(
          `Exchange rates missing for currency translation from ${line.currencyCode} to ${reportingCurrency}`,
        );
      }
      const determined = determineRateForAccount(line.accountType, rates);
      rateType = determined.rateType;
      rateScaled = determined.rateScaled;
    }

    const reportingDebitMinor = translateAmount(line.debitMinor, rateScaled);
    const reportingCreditMinor = translateAmount(line.creditMinor, rateScaled);

    totalTransDebit += reportingDebitMinor;
    totalTransCredit += reportingCreditMinor;

    translatedLines.push({
      glAccountId: line.glAccountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountType: line.accountType,
      localCurrency: line.currencyCode,
      localDebitMinor: line.debitMinor,
      localCreditMinor: line.creditMinor,
      fxRateType: rateType,
      fxRateAppliedScaled: rateScaled,
      reportingCurrency,
      reportingDebitMinor,
      reportingCreditMinor,
    });
  }

  // CTA balancing:
  // If translated Debits > Credits, we need a Credit to CTA equity.
  // If translated Credits > Debits, we need a Debit to CTA equity.
  let ctaAmountMinor = 0n;
  let ctaIsCredit = true;

  if (totalTransDebit > totalTransCredit) {
    ctaAmountMinor = totalTransDebit - totalTransCredit;
    ctaIsCredit = true;
  } else if (totalTransCredit > totalTransDebit) {
    ctaAmountMinor = totalTransCredit - totalTransDebit;
    ctaIsCredit = false;
  }

  return {
    lines: translatedLines,
    totalSubsidiaryDebitMinor: totalSubDebit,
    totalSubsidiaryCreditMinor: totalSubCredit,
    totalTranslatedDebitMinor: totalTransDebit,
    totalTranslatedCreditMinor: totalTransCredit,
    ctaAmountMinor,
    ctaIsCredit,
    isBalanced: totalTransDebit + (ctaIsCredit ? 0n : ctaAmountMinor) === totalTransCredit + (ctaIsCredit ? ctaAmountMinor : 0n),
  };
}
