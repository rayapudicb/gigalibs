import { describe, expect, it } from 'vitest';
import { calculateConvertedMinorUnits, getCurrencyDecimals } from './fx-math.js';

describe('FX Math & ISO 4217 Currency Exponents', () => {
  it('correctly maps ISO 4217 decimals', () => {
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
    expect(getCurrencyDecimals('GBP')).toBe(2);
    expect(getCurrencyDecimals('JPY')).toBe(0);
    expect(getCurrencyDecimals('BHD')).toBe(3);
    expect(getCurrencyDecimals('UNKNOWN')).toBe(2);
  });

  it('converts between equal-decimal currencies (USD -> EUR)', () => {
    // 100 USD = 10,000 cents. Rate = 0.921400 EUR per USD
    const converted = calculateConvertedMinorUnits(10_000, 921_400, 'USD', 'EUR');
    expect(converted).toBe(9_214); // 92.14 EUR
  });

  it('converts to zero-decimal currency (USD -> JPY) without exponent inflation', () => {
    // 100 USD = 10,000 cents. Rate = 154.25 JPY per USD (154_250_000 micros)
    const converted = calculateConvertedMinorUnits(10_000, 154_250_000, 'USD', 'JPY');
    expect(converted).toBe(15_425); // exactly 15,425 JPY (not 1,542,500,000!)
  });

  it('converts from zero-decimal currency (JPY -> USD)', () => {
    // 15,425 JPY. Inverse rate = 0.006483 USD per JPY (6,483 micros)
    const converted = calculateConvertedMinorUnits(15_425, 6_483, 'JPY', 'USD');
    expect(converted).toBe(10_000); // 100.00 USD cents
  });

  it('converts to three-decimal currency (USD -> BHD)', () => {
    // 100 USD = 10,000 cents. Rate = 0.376000 BHD per USD (376_000 micros)
    const converted = calculateConvertedMinorUnits(10_000, 376_000, 'USD', 'BHD');
    expect(converted).toBe(37_600); // 37.600 BHD (37,600 fils)
  });

  it('rejects negative or invalid amounts', () => {
    expect(() => calculateConvertedMinorUnits(-100, 921_400, 'USD', 'EUR')).toThrow(
      'sourceAmountMinor must be a non-negative safe integer.',
    );
    expect(() => calculateConvertedMinorUnits(100, 0, 'USD', 'EUR')).toThrow(
      'rateMicros must be a positive safe integer.',
    );
  });
});
