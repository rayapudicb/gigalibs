import { describe, it, expect } from 'vitest';
import { HierarchyResolverService } from '../hierarchy-resolver.js';
import type { ValidatedRow } from '../types.js';

function makeRow(
  rowNumber: number,
  name: string,
  parentName: string | null,
  assetTag?: string,
): ValidatedRow {
  return {
    rowNumber,
    externalId: assetTag ?? null,
    dbValues: {
      name,
      asset_tag: assetTag ?? name,
      parent_asset_tag: parentName,
    },
    specValues: {},
    customValues: {},
    warnings: [],
  };
}

describe('HierarchyResolverService', () => {
  const service = new HierarchyResolverService();

  it('passes through rows for entity types without hierarchy', () => {
    const rows = [makeRow(1, 'A', null), makeRow(2, 'B', null)];
    const { sorted, cycleRows } = service.sortByHierarchy('vendors', rows as never);
    expect(sorted).toHaveLength(2);
    expect(cycleRows).toHaveLength(0);
  });

  it('sorts parents before children', () => {
    const child = makeRow(1, 'Child', 'PARENT-01', 'CHILD-01');
    const parent = makeRow(2, 'Parent', null, 'PARENT-01');
    // child is listed first in input
    const { sorted, cycleRows } = service.sortByHierarchy('assets', [child, parent]);
    expect(cycleRows).toHaveLength(0);
    const names = sorted.map((r) => r.dbValues['name']);
    expect(names.indexOf('Parent')).toBeLessThan(names.indexOf('Child'));
  });

  it('handles roots (no parent) correctly', () => {
    const a = makeRow(1, 'Root A', null, 'A');
    const b = makeRow(2, 'Root B', null, 'B');
    const { sorted, cycleRows } = service.sortByHierarchy('assets', [a, b]);
    expect(sorted).toHaveLength(2);
    expect(cycleRows).toHaveLength(0);
  });

  it('detects cycles', () => {
    const r1 = makeRow(1, 'A', 'B', 'A');
    const r2 = makeRow(2, 'B', 'A', 'B');
    const { sorted, cycleRows } = service.sortByHierarchy('assets', [r1, r2]);
    expect(cycleRows).toHaveLength(2);
    expect(sorted).toHaveLength(0);
  });

  it('handles 3-level hierarchy in correct order', () => {
    const grandchild = makeRow(1, 'GC', 'Child', 'GC');
    const root = makeRow(2, 'Root', null, 'ROOT');
    const child = makeRow(3, 'Child', 'Root', 'CHILD');
    const { sorted, cycleRows } = service.sortByHierarchy('assets', [grandchild, root, child]);
    expect(cycleRows).toHaveLength(0);
    const names = sorted.map((r) => r.dbValues['name'] as string);
    expect(names.indexOf('Root')).toBeLessThan(names.indexOf('Child'));
    expect(names.indexOf('Child')).toBeLessThan(names.indexOf('GC'));
  });
});
