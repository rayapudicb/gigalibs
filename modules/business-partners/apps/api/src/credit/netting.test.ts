import { describe, expect, it } from 'vitest';
import { calculatePartnerNetting } from './netting.js';

describe('calculatePartnerNetting', () => {
  it('nets a net receivable (partner owes us more than we owe them)', () => {
    const r = calculatePartnerNetting(10_000n, 3_000n);
    expect(r.nettableMinor).toBe(3_000n);
    expect(r.netReceivableMinor).toBe(7_000n);
    expect(r.netPayableMinor).toBe(0n);
    expect(r.position).toBe('NET_RECEIVABLE');
    expect(r.netAmountMinor).toBe(7_000n);
  });

  it('nets a net payable (we owe the partner more than they owe us)', () => {
    const r = calculatePartnerNetting(2_500n, 9_000n);
    expect(r.nettableMinor).toBe(2_500n);
    expect(r.netReceivableMinor).toBe(0n);
    expect(r.netPayableMinor).toBe(6_500n);
    expect(r.position).toBe('NET_PAYABLE');
    expect(r.netAmountMinor).toBe(6_500n);
  });

  it('settles exactly when AR equals AP', () => {
    const r = calculatePartnerNetting(5_000n, 5_000n);
    expect(r.nettableMinor).toBe(5_000n);
    expect(r.position).toBe('SETTLED');
    expect(r.netAmountMinor).toBe(0n);
  });

  it('leaves the full receivable when there is no payable', () => {
    const r = calculatePartnerNetting(4_200n, 0n);
    expect(r.nettableMinor).toBe(0n);
    expect(r.position).toBe('NET_RECEIVABLE');
    expect(r.netAmountMinor).toBe(4_200n);
  });

  it('leaves the full payable when there is no receivable', () => {
    const r = calculatePartnerNetting(0n, 4_200n);
    expect(r.position).toBe('NET_PAYABLE');
    expect(r.netAmountMinor).toBe(4_200n);
  });

  it('is SETTLED when both sides are zero', () => {
    expect(calculatePartnerNetting(0n, 0n).position).toBe('SETTLED');
  });

  it('refuses negative balances (lost or out-of-order source facts)', () => {
    expect(() => calculatePartnerNetting(-1n, 100n)).toThrow(/negative/);
    expect(() => calculatePartnerNetting(100n, -1n)).toThrow(/negative/);
  });
});
