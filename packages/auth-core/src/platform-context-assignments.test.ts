import { generateKeyPairSync } from 'node:crypto';
import {
  MAX_CONTEXT_ASSIGNMENTS,
  type PlatformContextAssignmentScope,
  baseRolePermissions,
  decodeAssignmentGrants,
  moduleDefaultRoles,
} from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  type PlatformContextSubject,
  buildPlatformContext,
  signPlatformContextToken,
  verifyPlatformContextToken,
} from './platform-context.js';

// WI-OI-120w (R2 slice 3, ADR-0034 §5): the signed context carries each role assignment, with what it grants (a
// bitmap over `granted_scopes`) and where it applies; and it stays small enough for a request header.
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const AUDIENCE = 'gigalibs-finance-api';
const member: PlatformContextAssignmentScope = { kind: 'MEMBER' };

function subject(
  assignments: PlatformContextSubject['assignments'],
  permissions = [...new Set((assignments ?? []).flatMap((assignment) => assignment.permissions))],
  role = 'MEMBER',
): PlatformContextSubject {
  return {
    user: { id: 'cmuy0autt0031l807snorsbhr' },
    tenant: { id: 'cmuy0autt0031l807snorsbhs', entitlements: [{ moduleKey: 'finance', status: 'ENABLED', version: '2026-10-07T00:00:00.000Z' }] },
    roles: [role],
    platformRoles: [],
    permissions,
    authVersion: 1_789_000_000,
    session: { id: 'cmuy0autt0031l807snorsbht' },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT', tree_version: 'cmuy0autt0031l807snorsbhu' },
    ...(assignments ? { assignments } : {}),
  };
}
const mint = (value: PlatformContextSubject) => signPlatformContextToken(buildPlatformContext(value, 'finance', AUDIENCE), privateKey);

describe('assignment claims in the signed context', () => {
  it('signs each assignment as the part of granted_scopes it grants, with where it applies', () => {
    const base = ['users:read', 'profile:*'];
    const approver = ['finance:read', 'finance:journals:approve'];
    const reader = ['finance:read'];
    const token = mint(
      subject([
        { permissions: base, scope: member },
        { permissions: approver, scope: { kind: 'UNITS', tree_version: 'version-1', unit_ids: ['north'] } },
        { permissions: reader, scope: { kind: 'UNITS', tree_version: 'version-1', unit_ids: ['south'] } },
      ]),
    );
    const context = verifyPlatformContextToken(token, publicKey, AUDIENCE);
    expect(context.assignments?.items.map((item) => decodeAssignmentGrants(context.granted_scopes, item.grants))).toEqual([base, approver, reader]);
    expect(context.assignments?.items.map((item) => item.scope)).toEqual([
      member,
      { kind: 'UNITS', tree_version: 'version-1', unit_ids: ['north'] },
      { kind: 'UNITS', tree_version: 'version-1', unit_ids: ['south'] },
    ]);
  });

  it('carries no claim for a subject resolved before assignments existed', () => {
    const context = verifyPlatformContextToken(mint(subject(undefined, ['finance:read'])), publicKey, AUDIENCE);
    expect(context.assignments).toBeUndefined();
  });

  it('never lets an assignment name more than the context grants', () => {
    // A code outside granted_scopes is left out of the bitmap: the assignment grants less, never more.
    const context = buildPlatformContext(subject([{ permissions: ['finance:read', 'finance:journals:post'], scope: member }], ['finance:read']), 'finance', AUDIENCE);
    expect(decodeAssignmentGrants(context.granted_scopes, context.assignments!.items[0]!.grants)).toEqual(['finance:read']);
    // A forged bitmap that points past granted_scopes, or has the wrong length, is refused at signing and on arrival.
    for (const grants of ['ff', '0101'])
      expect(() => signPlatformContextToken({ ...context, assignments: { version: 1, items: [{ grants, scope: member }] } }, privateKey)).toThrow(/assignment/);
  });

  it('keeps a realistic member small: Manager with 20 module roles under 8 KB, and the cap under 12 KB', () => {
    const roles = moduleDefaultRoles.slice(0, 20);
    expect(roles).toHaveLength(20);
    const base = baseRolePermissions('MANAGER');
    const realistic = mint(
      subject(
        [{ permissions: base, scope: member }, ...roles.map((role) => ({ permissions: role.permissions, scope: member }))],
        [...new Set([...base, ...roles.flatMap((role) => role.permissions)])],
        'MANAGER',
      ),
    );
    expect(realistic.length).toBeLessThan(8_192);
    const atCap = Array.from({ length: MAX_CONTEXT_ASSIGNMENTS }, (_, index) => ({
      permissions: index === 0 ? base : moduleDefaultRoles[index % moduleDefaultRoles.length]!.permissions,
      scope: member,
    }));
    expect(mint(subject(atCap, undefined, 'MANAGER')).length).toBeLessThan(12_288);
    expect(() => mint(subject([...atCap, { permissions: base, scope: member }], undefined, 'MANAGER'))).toThrow();
  });
});
