import { describe, expect, it } from 'vitest';
import { RecordExchangeRateSchema, fxRateTableFromRows } from './index.js';

// WI-OI-120 (M-CUR, Phase 5A): the workspace exchange-rate write contract and the pure table bridge the FX engine
// converts with.
describe('RecordExchangeRateSchema', () => {
  it('accepts a real, positive rate with a source', () => {
    const parsed = RecordExchangeRateSchema.safeParse({
      baseCurrency: 'USD',
      quoteCurrency: 'EUR',
      rate: 0.924,
      source: 'ECB',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-positive rate rather than defaulting', () => {
    expect(
      RecordExchangeRateSchema.safeParse({
        baseCurrency: 'USD',
        quoteCurrency: 'EUR',
        rate: 0,
        source: 'ECB',
      }).success,
    ).toBe(false);
  });

  it('rejects a base equal to the quote', () => {
    expect(
      RecordExchangeRateSchema.safeParse({
        baseCurrency: 'USD',
        quoteCurrency: 'USD',
        rate: 1,
        source: 'manual',
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed currency code and unknown fields', () => {
    expect(
      RecordExchangeRateSchema.safeParse({
        baseCurrency: 'US',
        quoteCurrency: 'EUR',
        rate: 1.1,
        source: 'ECB',
      }).success,
    ).toBe(false);
    expect(
      RecordExchangeRateSchema.safeParse({
        baseCurrency: 'USD',
        quoteCurrency: 'EUR',
        rate: 1.1,
        source: 'ECB',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('fxRateTableFromRows', () => {
  it('builds a base-relative table with the base mapped to 1', () => {
    expect(
      fxRateTableFromRows('USD', [
        { quoteCurrency: 'EUR', rate: 0.924 },
        { quoteCurrency: 'JPY', rate: 154.2 },
      ]),
    ).toEqual({ USD: 1, EUR: 0.924, JPY: 154.2 });
  });

  it('maps an empty rate set to just the base', () => {
    expect(fxRateTableFromRows('USD', [])).toEqual({ USD: 1 });
  });
});
