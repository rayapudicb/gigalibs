import { describe, expect, it } from 'vitest';
import { calculateAtp } from './atp.js';

describe('calculateAtp', () => {
  it('returns onHand minus reserved', () => {
    const atp = calculateAtp('100.000000', '15.500000');
    expect(atp.availableQuantity).toBe('84.500000');
    expect(atp.sufficientFor('84.500000')).toBe(true);
    expect(atp.sufficientFor('84.500001')).toBe(false);
  });

  it('refuses reserved greater than on-hand', () => {
    expect(() => calculateAtp('10.000000', '10.000001')).toThrow(/reconciled/);
  });
});
