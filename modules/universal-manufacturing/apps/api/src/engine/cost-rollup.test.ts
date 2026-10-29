import { describe, expect, it } from 'vitest';
import { applyScrapFactor, rollupMaterialCost } from './cost-rollup.js';

describe('applyScrapFactor', () => {
  it('increases quantity by scrap percent', () => {
    expect(applyScrapFactor('100.000000', '10')).toBe('110.000000');
  });
  it('rejects invalid scrap', () => {
    expect(() => applyScrapFactor('1', '100')).toThrow();
  });
});

describe('rollupMaterialCost', () => {
  it('sums line extended costs in minor units', () => {
    const total = rollupMaterialCost([
      { productId: 'a', quantity: '2.0000000000', unitCostMinor: '1000000000' },
      { productId: 'b', quantity: '1.0000000000', unitCostMinor: '500000000' },
    ]);
    expect(total).toBe('250000');
  });
});
