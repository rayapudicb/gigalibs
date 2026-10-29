import { describe, expect, it } from 'vitest';
import { type BomNode, explodeBomRequirements } from './bom-explosion.js';

describe('explodeBomRequirements', () => {
  const subAssembly: BomNode = {
    id: 'sub',
    finishedProductId: 'sub-product',
    lines: [{ componentProductId: 'raw-b', uomId: 'uom', quantityPer: '2' }],
  };
  const top: BomNode = {
    id: 'top',
    finishedProductId: 'fg',
    lines: [
      { componentProductId: 'raw-a', uomId: 'uom', quantityPer: '1' },
      { componentProductId: 'sub-product', uomId: 'uom', quantityPer: '3', subBomId: 'sub' },
    ],
  };

  it('rolls up sub-assemblies recursively', () => {
    const map = explodeBomRequirements(top, '10', new Map([['sub', subAssembly]]));
    expect(map.get('raw-a')?.quantity).toBe('10.000000');
    expect(map.get('raw-b')?.quantity).toBe('60.000000');
    expect(map.has('sub-product')).toBe(false);
  });
});
