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

export function calculateConvertedMinorUnits(
  sourceAmountMinor: number,
  rateMicros: number,
  fromCurrency: string,
  toCurrency: string,
): number {
  if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor < 0) {
    throw new Error('sourceAmountMinor must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(rateMicros) || rateMicros <= 0) {
    throw new Error('rateMicros must be a positive safe integer.');
  }

  const fromDecimals = getCurrencyDecimals(fromCurrency);
  const toDecimals = getCurrencyDecimals(toCurrency);
  const exponentDiff = toDecimals - fromDecimals;

  const scaledRate = BigInt(rateMicros);
  const scaledAmount = BigInt(sourceAmountMinor);

  if (exponentDiff >= 0) {
    const factor = BigInt(10 ** exponentDiff);
    const numerator = scaledAmount * scaledRate * factor;
    const rounded = (numerator + 500_000n) / 1_000_000n;
    return Number(rounded);
  } else {
    const divisor = BigInt(10 ** Math.abs(exponentDiff)) * 1_000_000n;
    const numerator = scaledAmount * scaledRate;
    const halfDivisor = divisor / 2n;
    const rounded = (numerator + halfDivisor) / divisor;
    return Number(rounded);
  }
}
