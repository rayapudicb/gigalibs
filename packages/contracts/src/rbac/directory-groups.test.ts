import { describe, expect, it } from 'vitest';
import {
  type DirectoryGroupMapping,
  type HeldDirectoryAssignment,
  SetDirectoryGroupMappingSchema,
  planDirectoryReconcile,
  resolveGroupRoleGrants,
} from './directory-groups.js';

// WI-OI-120 (R15): mapping directory groups to scoped roles. The control plane applies the plan through the ordinary
// assignment engine; these lock down the pure resolve + reconcile logic.
const mappings: DirectoryGroupMapping[] = [
  {
    externalGroupId: 'ad-north-techs',
    customRoleId: 'role-tech',
    scope: 'UNITS',
    unitIds: ['north'],
  },
  {
    externalGroupId: 'ad-south-techs',
    customRoleId: 'role-tech',
    scope: 'UNITS',
    unitIds: ['south'],
  },
  { externalGroupId: 'ad-buyers', customRoleId: 'role-buyer', scope: 'WORKSPACE', unitIds: [] },
  { externalGroupId: 'ad-all-tech', customRoleId: 'role-tech', scope: 'WORKSPACE', unitIds: [] },
];

describe('resolveGroupRoleGrants', () => {
  it('maps a single group to its scoped role', () => {
    expect(resolveGroupRoleGrants(['ad-buyers'], mappings)).toEqual([
      { customRoleId: 'role-buyer', scope: 'WORKSPACE', unitIds: [] },
    ]);
  });

  it('merges the units of two UNITS mappings for the same role', () => {
    expect(resolveGroupRoleGrants(['ad-north-techs', 'ad-south-techs'], mappings)).toEqual([
      { customRoleId: 'role-tech', scope: 'UNITS', unitIds: ['north', 'south'] },
    ]);
  });

  it('lets WORKSPACE win over UNITS for the same role (a role is held at one scope only)', () => {
    expect(resolveGroupRoleGrants(['ad-north-techs', 'ad-all-tech'], mappings)).toEqual([
      { customRoleId: 'role-tech', scope: 'WORKSPACE', unitIds: [] },
    ]);
  });

  it('ignores groups the person is not in, and mappings for absent groups', () => {
    expect(resolveGroupRoleGrants([], mappings)).toEqual([]);
    expect(resolveGroupRoleGrants(['unmapped-group'], mappings)).toEqual([]);
  });
});

describe('planDirectoryReconcile', () => {
  const held: HeldDirectoryAssignment[] = [
    { assignmentId: 'a-tech', customRoleId: 'role-tech', scope: 'UNITS', unitIds: ['north'] },
    { assignmentId: 'a-old', customRoleId: 'role-legacy', scope: 'WORKSPACE', unitIds: [] },
  ];

  it('grants newly-desired roles and revokes ones no longer desired', () => {
    const desired = resolveGroupRoleGrants(['ad-north-techs', 'ad-buyers'], mappings);
    const plan = planDirectoryReconcile(desired, held);
    // role-tech@north already held → untouched; role-buyer new → grant; role-legacy no longer desired → revoke.
    expect(plan.toGrant).toEqual([{ customRoleId: 'role-buyer', scope: 'WORKSPACE', unitIds: [] }]);
    expect(plan.toRevoke).toEqual(['a-old']);
  });

  it('treats a scope/unit change as revoke-old + grant-new', () => {
    const desired = resolveGroupRoleGrants(['ad-north-techs', 'ad-south-techs'], mappings); // role-tech now north+south
    const plan = planDirectoryReconcile(desired, held);
    expect(plan.toRevoke).toContain('a-tech'); // the north-only assignment is revoked
    expect(plan.toGrant).toEqual([
      { customRoleId: 'role-tech', scope: 'UNITS', unitIds: ['north', 'south'] },
    ]);
  });

  it('no change when desired already matches held exactly', () => {
    const desired = [{ customRoleId: 'role-tech', scope: 'UNITS' as const, unitIds: ['north'] }];
    const plan = planDirectoryReconcile(desired, held.slice(0, 1));
    expect(plan.toGrant).toEqual([]);
    expect(plan.toRevoke).toEqual([]);
  });
});

describe('SetDirectoryGroupMappingSchema', () => {
  it('requires units for a UNITS mapping and forbids them for WORKSPACE', () => {
    expect(
      SetDirectoryGroupMappingSchema.safeParse({
        externalGroupId: 'g',
        customRoleId: 'r',
        scope: 'UNITS',
        unitIds: ['north'],
        reason: 'map it',
      }).success,
    ).toBe(true);
    expect(
      SetDirectoryGroupMappingSchema.safeParse({
        externalGroupId: 'g',
        customRoleId: 'r',
        scope: 'UNITS',
        unitIds: [],
        reason: 'map it',
      }).success,
    ).toBe(false);
    expect(
      SetDirectoryGroupMappingSchema.safeParse({
        externalGroupId: 'g',
        customRoleId: 'r',
        scope: 'WORKSPACE',
        unitIds: ['north'],
        reason: 'map it',
      }).success,
    ).toBe(false);
    expect(
      SetDirectoryGroupMappingSchema.safeParse({
        externalGroupId: 'g',
        customRoleId: 'r',
        scope: 'WORKSPACE',
        unitIds: [],
        reason: 'map it',
      }).success,
    ).toBe(true);
  });
});
