import { describe, expect, it } from 'vitest';
import type { CmmsPrincipal } from './authorization.js';
import { assertWritableScope, scopePredicates } from './scope.js';

// WI-OI-120be (W1 review A, M1): no production caller passes a unit tree, so a grant on a parent unit must keep its child
// units through the sign-in's department list (the closure of the granted units), as before this release.
const northPlanner = {
  tenantId: 'tenant-a',
  subject: 'planner-north',
  organization: {
    mode: 'UNITS',
    tree_version: 'v1',
    read_roots: ['north'],
    write_roots: ['north'],
  },
  departmentScope: {
    mode: 'DEPARTMENTS',
    departmentIds: ['north', 'north-line-1', 'north-line-2'],
  },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;

describe('a unit grant without a unit tree', () => {
  it('reads the granted unit and every unit under it, and shared records', () => {
    const values: unknown[] = ['tenant-a'];
    const predicates = scopePredicates(northPlanner, values, 'w.');
    expect(predicates).toEqual(['(w.department_id IS NULL OR w.department_id = ANY($2::text[]))']);
    expect(values[1]).toEqual(['north', 'north-line-1', 'north-line-2']);
  });

  it('writes in a child unit, but not in a sibling unit or a shared record', () => {
    expect(() =>
      assertWritableScope(northPlanner, { departmentId: 'north-line-1', siteRef: null }),
    ).not.toThrow();
    expect(() =>
      assertWritableScope(northPlanner, { departmentId: 'south', siteRef: null }),
    ).toThrow(/outside your write access/);
    expect(() => assertWritableScope(northPlanner, { departmentId: null, siteRef: null })).toThrow(
      /tenant-wide authority/,
    );
  });

  it('still fails closed when the department list overflowed (empty)', () => {
    const overflowed = {
      ...northPlanner,
      departmentScope: { mode: 'DEPARTMENTS', departmentIds: [] },
    } as unknown as CmmsPrincipal;
    expect(scopePredicates(overflowed, ['tenant-a'], 'w.')).toEqual(['FALSE']);
    expect(() =>
      assertWritableScope(overflowed, { departmentId: 'north', siteRef: null }),
    ).toThrow();
  });
});
