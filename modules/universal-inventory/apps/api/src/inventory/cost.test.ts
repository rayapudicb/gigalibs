import { describe, expect, it } from 'vitest';
import { computeMovingAverageUnitCostMinor } from './cost.js';

describe('computeMovingAverageUnitCostMinor', () => {
  it('returns incoming cost when prior on-hand is zero', () => {
    expect(computeMovingAverageUnitCostMinor('0.000000', '100', '10.000000', '200')).toBe('200');
  });

  it('blends prior and incoming quantities', () => {
    // 10 @ 100 + 10 @ 300 => 20 @ 200
    expect(computeMovingAverageUnitCostMinor('10.000000', '100', '10.000000', '300')).toBe('200');
  });
});
