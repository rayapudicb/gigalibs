export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  INR: 2,
  SGD: 2,
  CNY: 2,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
};

export function getCurrencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Perform exact fixed-point currency conversion in minor units with half-up rounding.
 * Uses 1,000,000 micros scaling (e.g. 1.085000 EUR/USD = 1_085_000 rateMicros).
 */
export function calculateConvertedMinorUnits(
  sourceAmountMinor: number,
  rateMicros: number | bigint,
  fromCurrency: string,
  toCurrency: string,
): number {
  if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor < 0) {
    throw new Error('sourceAmountMinor must be a non-negative safe integer.');
  }
  const rateBig = BigInt(rateMicros);
  if (rateBig <= 0n) {
    throw new Error('rateMicros must be a positive integer.');
  }

  const fromDecimals = getCurrencyDecimals(fromCurrency);
  const toDecimals = getCurrencyDecimals(toCurrency);
  const exponentDiff = toDecimals - fromDecimals;

  const scaledAmount = BigInt(sourceAmountMinor);

  if (exponentDiff >= 0) {
    const factor = BigInt(10 ** exponentDiff);
    const numerator = scaledAmount * rateBig * factor;
    const rounded = (numerator + 500_000n) / 1_000_000n;
    return Number(rounded);
  } else {
    const divisor = BigInt(10 ** Math.abs(exponentDiff)) * 1_000_000n;
    const numerator = scaledAmount * rateBig;
    const halfDivisor = divisor / 2n;
    const rounded = (numerator + halfDivisor) / divisor;
    return Number(rounded);
  }
}
