import { type PlatformContextSubject, buildPlatformContext } from '@gigalibs/auth-core';
import { describe, expect, it } from 'vitest';
import { principalFromContext } from './signed-context.js';
import { scopeFor } from './index.js';

// WI-OI-120w (R2 slice 3, ADR-0034 §1): where a person may use a permission is decided per role assignment. One
// assignment's permissions never combine with another's scope.
const north = { kind: 'UNITS' as const, tree_version: 'version-7', unit_ids: ['north'] };
const south = { kind: 'UNITS' as const, tree_version: 'version-7', unit_ids: ['south'] };

function principal(assignments: PlatformContextSubject['assignments'], overrides: Partial<PlatformContextSubject> = {}) {
  const permissions = [...new Set((assignments ?? []).flatMap((assignment) => assignment.permissions))];
  const subject: PlatformContextSubject = {
    user: { id: 'user-1' },
    tenant: { id: 'tenant-1', entitlements: [{ moduleKey: 'finance', status: 'ENABLED', version: 'v1' }] },
    roles: ['MEMBER'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: 'session-1' },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'UNITS', tree_version: 'version-7', read_roots: ['north', 'south'], write_roots: ['north'] },
    ...(assignments ? { assignments } : {}),
    ...overrides,
  };
  return principalFromContext(buildPlatformContext(subject, 'finance', 'gigalibs-finance-api'));
}

describe('scopeFor', () => {
  it('approver in North, reader in South: approve in North only, read in both, nothing else anywhere', () => {
    const person = principal([
      { permissions: ['profile:*'], scope: { kind: 'MEMBER' } },
      { permissions: ['finance:read', 'finance:journals:approve'], scope: north },
      { permissions: ['finance:read'], scope: south },
    ]);
    expect(scopeFor(person, 'finance:journals:approve').coverage).toEqual([{ kind: 'UNITS', treeVersion: 'version-7', unitIds: ['north'] }]);
    expect(scopeFor(person, 'finance:read').coverage).toEqual([
      { kind: 'UNITS', treeVersion: 'version-7', unitIds: ['north'] },
      { kind: 'UNITS', treeVersion: 'version-7', unitIds: ['south'] },
    ]);
    expect(scopeFor(person, 'finance:journals:post').coverage).toEqual([]);
    // The member-wide union still lists approve: the per-assignment answer is what keeps it out of South.
    expect(person.permissions).toContain('finance:journals:approve');
  });

  it("applies a family wildcard only where its assignment applies", () => {
    const person = principal([
      { permissions: ['finance:*'], scope: north },
      { permissions: ['finance:read'], scope: { kind: 'PLACES', place_ids: ['5f0c6a0e-6a8e-4c1b-9b1e-2f7c3c9d1a11'] } },
    ]);
    expect(scopeFor(person, 'finance:journals:approve').coverage).toEqual([{ kind: 'UNITS', treeVersion: 'version-7', unitIds: ['north'] }]);
    expect(scopeFor(person, 'finance.read').coverage).toHaveLength(2);
  });

  it("gives every role at the member's own scope that scope, listed once, exactly as modules read it today", () => {
    const person = principal([
      { permissions: ['users:read'], scope: { kind: 'MEMBER' } },
      { permissions: ['cmms:read', 'cmms.work-orders.read'], scope: { kind: 'MEMBER' } },
      { permissions: ['workforce:read'], scope: { kind: 'MEMBER' } },
      { permissions: ['cmms:read'], scope: { kind: 'TENANT' } },
    ]);
    const member = { kind: 'MEMBER', organization: person.organization, places: person.placeScope, departments: person.departmentScope };
    expect(scopeFor(person, 'workforce:read').coverage).toEqual([member]);
    expect(scopeFor(person, 'cmms:read').coverage).toEqual([member, { kind: 'TENANT' }]);
    expect(member.organization).toEqual({ mode: 'UNITS', tree_version: 'version-7', read_roots: ['north', 'south'], write_roots: ['north'] });
  });

  // Security review of slice 3, L2: a module still on departments keeps them through the member coverage.
  it('carries the legacy department scope in the member coverage', () => {
    const person = principal([{ permissions: ['cmms:read'], scope: { kind: 'MEMBER' } }], {
      orgScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['dept-ops'] },
      organizationScope: null,
    });
    expect(scopeFor(person, 'cmms:read').coverage).toEqual([
      { kind: 'MEMBER', organization: { mode: 'TENANT' }, places: { mode: 'ALL' }, departments: { mode: 'DEPARTMENTS', departmentIds: ['dept-ops'] } },
    ]);
  });

  it('treats a context without assignment claims as before: a held permission applies at the member scope', () => {
    const person = principal(undefined, { permissions: ['finance:read'] });
    expect(person.assignments).toBeUndefined();
    expect(scopeFor(person, 'finance:read').coverage).toEqual([
      { kind: 'MEMBER', organization: person.organization, places: person.placeScope, departments: person.departmentScope },
    ]);
    expect(scopeFor(person, 'finance:journals:approve').coverage).toEqual([]);
  });
});
