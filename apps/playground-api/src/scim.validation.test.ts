import { describe, expect, it } from 'vitest';
import { parseScim, scimMembershipChanges, scimPageNumber, ScimPatchSchema, ScimUserCreateSchema } from './scim.validation.js';

describe('SCIM bounded mutation input', () => {
  it.each(['SUPER_ADMIN', 'PLATFORM_OWNER', 'unknown', '*'])('refuses role %s in create and both PATCH forms', (role) => {
    const roles = [{ value: role }];
    expect(() => parseScim(ScimUserCreateSchema, { userName: 'a@example.invalid', roles })).toThrow();
    for (const operation of [{ op: 'replace', path: 'roles', value: roles }, { op: 'add', value: { roles } }]) {
      expect(() => parseScim(ScimPatchSchema, { Operations: [operation] })).toThrow();
    }
  });
  it.each([
    { op: 'replace', path: 'active', value: 'false' },
    { op: 'replace', path: 'active', value: {} },
    { op: 'remove', path: 'roles' },
    { op: 'replace', path: 'userName', value: 'other@example.invalid' },
    { op: 'replace', value: { active: true, tenantId: 'another' } },
    { op: 'replace', value: {} },
    { op: 'replace', path: 'roles', value: [{ value: 'MEMBER' }, { value: 'SUPER_ADMIN' }] },
  ])('refuses malformed or unsupported operation %j', (operation) => {
    expect(() => parseScim(ScimPatchSchema, { Operations: [operation] })).toThrow();
  });
  it('validates every operation before resolving supported state and role changes', () => {
    const input = parseScim(ScimPatchSchema, { Operations: [
      { op: 'Replace', path: 'active', value: false },
      { op: 'add', value: { roles: [{ value: 'VIEWER' }], active: true } },
    ] });
    expect(scimMembershipChanges(input)).toEqual({ active: true, role: 'VIEWER' });
    expect(() => parseScim(ScimPatchSchema, { Operations: [...input.Operations, { op: 'add', value: { roles: [{ value: 'SUPER_ADMIN' }] } }] })).toThrow();
  });
  it('normalizes email and rejects ambiguous identities or injected attributes', () => {
    expect(parseScim(ScimUserCreateSchema, { userName: ' Person@Example.invalid ' }).userName).toBe('person@example.invalid');
    expect(() => parseScim(ScimUserCreateSchema, { userName: 'a@example.invalid', emails: [{ value: 'b@example.invalid' }] })).toThrow();
    expect(() => parseScim(ScimUserCreateSchema, { userName: 'a@example.invalid', permissions: ['*'] })).toThrow();
  });
  it('bounds pagination rather than accepting partial integers or NaN', () => {
    expect(scimPageNumber(undefined, 20, 100)).toBe(20);
    for (const value of ['1garbage', 'NaN', '-1', '0', '101', '99999999999999999999']) {
      expect(() => scimPageNumber(value, 20, 100)).toThrow();
    }
  });
});
