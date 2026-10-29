import { describe, expect, it } from 'vitest';
import { netMrpRequirements } from './mrp-netting.js';

describe('netMrpRequirements', () => {
  it('nets demand minus supply with zero floor', () => {
    const rows = netMrpRequirements([
      { productId: 'p1', warehouseId: 'w1', demand: '10.000000', supply: '3.000000' },
      { productId: 'p2', warehouseId: 'w1', demand: '2.000000', supply: '5.000000' },
    ]);
    expect(rows[0]?.netRequirement).toBe('7.000000');
    expect(rows[1]?.netRequirement).toBe('0');
  });
});
