import { describe, expect, it } from 'vitest';
import { calculateCreditExposure } from './exposure.js';

describe('Business Partner exact credit exposure', () => {
  it('adds open AR and uninvoiced orders, then subtracts prepayments', () => {
    expect(calculateCreditExposure([
      { component: 'OPEN_AR', deltaMinor: 8_000n },
      { component: 'UNINVOICED_ORDER', deltaMinor: 4_000n },
      { component: 'PREPAYMENT', deltaMinor: 3_000n },
    ], 10_000n)).toMatchObject({ exposureMinor: 9_000n, availableMinor: 1_000n, overLimit: false });
  });

  it('only holds when exposure exceeds the limit', () => {
    expect(calculateCreditExposure([{ component: 'OPEN_AR', deltaMinor: 10_000n }], 10_000n).overLimit).toBe(false);
    expect(calculateCreditExposure([{ component: 'OPEN_AR', deltaMinor: 10_001n }], 10_000n).overLimit).toBe(true);
  });

  it('retains exact arithmetic above JavaScript safe integers and supports corrections', () => {
    const amount = 9_007_199_254_740_993n;
    expect(calculateCreditExposure([
      { component: 'OPEN_AR', deltaMinor: amount },
      { component: 'OPEN_AR', deltaMinor: -amount },
      { component: 'UNINVOICED_ORDER', deltaMinor: amount },
    ], amount).availableMinor).toBe(0n);
  });

  it('fails closed on an impossible negative component or limit', () => {
    expect(() => calculateCreditExposure([{ component: 'PREPAYMENT', deltaMinor: -1n }], 0n)).toThrow('missing a source fact');
    expect(() => calculateCreditExposure([], -1n)).toThrow('limit cannot be negative');
  });
});
