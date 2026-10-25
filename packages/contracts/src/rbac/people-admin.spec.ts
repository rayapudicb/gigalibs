/** WI-OI-120p slice 4 (R13): delegated people-administration authorization. */
import { describe, expect, it } from 'vitest';
import { assertDelegatedPeopleAdd } from './people-admin.js';

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
