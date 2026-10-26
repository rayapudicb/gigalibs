import { describe, expect, it } from 'vitest';
import { type FxRateTable, MultiCurrencyEngine, NoExchangeRateError } from './index.js';

// WI-OI-120 (M-CUR, Phase 5A): conversion uses real, supplied rates and refuses when one is missing — the fabricated
// DEFAULT_FX_RATES and the silent 1.0 fallback are gone.
const rates: FxRateTable = { USD: 1.0, EUR: 0.924, JPY: 154.2 }; // USD-base: units per 1 USD

describe('MultiCurrencyEngine.convert', () => {
  it('converts through the base using the supplied rates', () => {
    expect(MultiCurrencyEngine.convert(100, 'USD', 'EUR', rates)).toBe(92.4);
    expect(MultiCurrencyEngine.convert(92.4, 'EUR', 'USD', rates)).toBe(100);
  });

  it('passes a same-currency amount through unchanged', () => {
    expect(MultiCurrencyEngine.convert(100, 'USD', 'USD', rates)).toBe(100);
  });

  it('throws NoExchangeRateError when a rate is missing — no fabricated 1.0', () => {
    expect(() => MultiCurrencyEngine.convert(100, 'USD', 'GBP', rates)).toThrow(
      NoExchangeRateError,
    );
    expect(() => MultiCurrencyEngine.convert(100, 'GBP', 'USD', rates)).toThrow(
      /No exchange rate for GBP/,
    );
  });

  it('rejects a non-positive or non-finite rate rather than defaulting', () => {
    expect(() => MultiCurrencyEngine.convert(100, 'USD', 'EUR', { USD: 1, EUR: 0 })).toThrow(
      NoExchangeRateError,
    );
  });
});

describe('MultiCurrencyEngine.convertMinorUnits', () => {
  it('respects differing minor units (USD cents -> JPY yen, 0 decimals)', () => {
    expect(MultiCurrencyEngine.convertMinorUnits(10_000, 'USD', 'JPY', rates)).toBe(15_420);
  });

  it('throws on a missing rate', () => {
    expect(() => MultiCurrencyEngine.convertMinorUnits(10_000, 'USD', 'GBP', rates)).toThrow(
      NoExchangeRateError,
    );
  });
});

describe('MultiCurrencyEngine.calculateRealizedGainLoss (explicit rates — unchanged)', () => {
  it('reports a gain when the receivable is worth more at settlement, with balanced entries', () => {
    const r = MultiCurrencyEngine.calculateRealizedGainLoss(
      'inv-1',
      'Acme',
      1000,
      'EUR',
      0.92,
      0.9,
    );
    expect(r.type).toBe('GAIN');
    expect(r.gainLossAmountBase).toBeGreaterThan(0);
    const debits = r.journalEntries.reduce((s, e) => s + e.debit, 0);
    const credits = r.journalEntries.reduce((s, e) => s + e.credit, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.01); // balanced to the cent
  });

  it('reports a loss the other way', () => {
    expect(
      MultiCurrencyEngine.calculateRealizedGainLoss('inv-2', 'Acme', 1000, 'EUR', 0.9, 0.92).type,
    ).toBe('LOSS');
  });
});
