/** WI-OI-120p slice 4 (R13): delegated people-administration authorization. */
import { describe, expect, it } from 'vitest';
import { assertDelegatedPeopleAdd, validateBulkPeopleAdd, validateBulkPeopleGrant } from './people-admin.js';

const scope = {
  units: ['north', 'northwest'],
  allowedRolesByUnit: { north: ['maint-tech', 'maint-planner'], northwest: ['maint-tech'] },
  heldRoleIds: ['maint-tech', 'maint-planner', 'maint-manager'],
};

describe('assertDelegatedPeopleAdd', () => {
  it('allows a managed unit, an allowed role the head holds, and a MEMBER base role', () => {
    expect(assertDelegatedPeopleAdd(scope, { unit: 'north', roleIds: ['maint-tech'] })).toEqual({ ok: true });
    expect(assertDelegatedPeopleAdd(scope, { unit: 'north', roleIds: ['maint-planner'], baseRole: 'MEMBER' })).toEqual({ ok: true });
  });

  it('refuses a unit the head does not manage', () => {
    expect(assertDelegatedPeopleAdd(scope, { unit: 'south', roleIds: ['maint-tech'] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_OUT_OF_UNIT' });
  });

  it("refuses a role not on the unit's allowance (planner not allowed in northwest)", () => {
    expect(assertDelegatedPeopleAdd(scope, { unit: 'northwest', roleIds: ['maint-planner'] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_ROLE_NOT_ALLOWED' });
  });

  it('refuses assigning a role the head does not hold, even if listed', () => {
    const wider = { ...scope, allowedRolesByUnit: { north: ['maint-tech', 'maint-manager', 'finance-approver'] } };
    expect(assertDelegatedPeopleAdd(wider, { unit: 'north', roleIds: ['finance-approver'] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_ESCALATION' });
  });

  it('refuses a base role above MEMBER (never Tenant Admin)', () => {
    expect(assertDelegatedPeopleAdd(scope, { unit: 'north', roleIds: ['maint-tech'], baseRole: 'TENANT_ADMIN' })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_NO_BASE_ROLE' });
  });
});

describe('validateBulkPeopleAdd', () => {
  const existing = new Set(['already@acme.test']);

  it('accepts a batch where every row is a valid, in-scope, non-duplicate new email', () => {
    const rows = [
      { email: 'Ann@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'bob@acme.test', unit: 'northwest', roleIds: ['maint-tech'] },
    ];
    expect(validateBulkPeopleAdd(rows, scope, existing)).toEqual({ ok: true, errors: [] });
  });

  it('is all-or-nothing: one bad row makes the whole batch invalid, with the offending index', () => {
    const rows = [
      { email: 'ann@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'carol@acme.test', unit: 'south', roleIds: ['maint-tech'] }, // out of scope
    ];
    const result = validateBulkPeopleAdd(rows, scope, existing);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ index: 1, email: 'carol@acme.test', code: 'PEOPLE_ADMIN_OUT_OF_UNIT', message: expect.any(String) }]);
  });

  it('flags a malformed email, an already-member email, a repeat within the batch, and a row with no roles', () => {
    const rows = [
      { email: 'not-an-email', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'already@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'dup@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'DUP@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'eve@acme.test', unit: 'north', roleIds: [] },
    ];
    const codes = validateBulkPeopleAdd(rows, scope, existing).errors.map((e) => e.code);
    expect(codes).toEqual(['BULK_INVALID_EMAIL', 'BULK_ALREADY_MEMBER', 'BULK_DUPLICATE_EMAIL', 'BULK_NO_ROLES']);
  });
});

describe('validateBulkPeopleGrant', () => {
  const members = new Set(['ann@acme.test', 'bob@acme.test']);

  it('accepts a batch of existing members with allowed, held, in-scope roles', () => {
    const rows = [
      { email: 'Ann@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'bob@acme.test', unit: 'northwest', roleIds: ['maint-tech'] },
    ];
    expect(validateBulkPeopleGrant(rows, scope, members)).toEqual({ ok: true, errors: [] });
  });

  it('refuses a non-member (grant targets existing people — invite newcomers instead)', () => {
    const rows = [{ email: 'stranger@acme.test', unit: 'north', roleIds: ['maint-tech'] }];
    const result = validateBulkPeopleGrant(rows, scope, members);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'BULK_NOT_A_MEMBER' });
  });

  it('still enforces the delegated rule (out-of-unit, not-allowed, escalation) and all-or-nothing', () => {
    const rows = [
      { email: 'ann@acme.test', unit: 'north', roleIds: ['maint-tech'] },
      { email: 'bob@acme.test', unit: 'south', roleIds: ['maint-tech'] }, // out of scope
    ];
    const result = validateBulkPeopleGrant(rows, scope, members);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ index: 1, email: 'bob@acme.test', code: 'PEOPLE_ADMIN_OUT_OF_UNIT', message: expect.any(String) }]);
  });
});
