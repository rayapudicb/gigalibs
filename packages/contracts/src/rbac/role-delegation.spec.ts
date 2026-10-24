/** WI-OI-120hq (R4): delegation within-own, scope and bounds rules. */
import { describe, expect, it } from 'vitest';
import { type DelegationScope, delegationBounds, scopeWithin, validateDelegation } from './role-delegation.js';

const now = new Date('2026-10-24T00:00:00Z');
const WORKSPACE: DelegationScope = { kind: 'WORKSPACE' };
const UNITS_AB: DelegationScope = { kind: 'UNITS', unitIds: ['a', 'b'] };
const UNITS_A: DelegationScope = { kind: 'UNITS', unitIds: ['a'] };
const PLACES_X: DelegationScope = { kind: 'PLACES', placeIds: ['x'] };

describe('scopeWithin', () => {
  it('a workspace-wide scope contains any narrower scope', () => {
    expect(scopeWithin(UNITS_A, WORKSPACE)).toBe(true);
    expect(scopeWithin(PLACES_X, WORKSPACE)).toBe(true);
  });
  it('a unit subset is within; a superset widens and is refused', () => {
    expect(scopeWithin(UNITS_A, UNITS_AB)).toBe(true);
    expect(scopeWithin(UNITS_AB, UNITS_A)).toBe(false);
  });
  it('refuses crossing dimensions (places within units)', () => {
    expect(scopeWithin(PLACES_X, UNITS_AB)).toBe(false);
  });
  it('refuses an empty unit set', () => {
    expect(scopeWithin({ kind: 'UNITS', unitIds: [] }, UNITS_AB)).toBe(false);
  });
});

describe('delegationBounds', () => {
  it('accepts a bounded future window within the horizon', () => {
    expect(delegationBounds('2026-10-25', '2026-11-01', now, 90)).toEqual({ ok: true });
  });
  it('refuses an end at or before the start', () => {
    expect(delegationBounds('2026-11-01', '2026-10-25', now, 90).ok).toBe(false);
  });
  it('refuses a window that has already ended', () => {
    expect(delegationBounds('2026-10-18', '2026-10-20', now, 90)).toMatchObject({ ok: false, code: 'DELEGATION_BOUNDS_INVALID' });
  });
  it('refuses a window longer than the horizon', () => {
    expect(delegationBounds('2026-10-25', '2027-02-01', now, 90)).toMatchObject({ ok: false, code: 'DELEGATION_TOO_LONG' });
  });
});

describe('validateDelegation', () => {
  const base = {
    grantorPermissions: ['workforce.bookings.manage'],
    grantorScope: UNITS_AB,
    delegationScope: UNITS_A,
    effectiveFrom: '2026-10-25',
    effectiveTo: '2026-11-01',
    now,
    maxHorizonDays: 90,
  };
  it('accepts a delegation within the grantor grant, scope and bounds', () => {
    expect(validateDelegation({ ...base, delegatedPermissions: ['workforce.bookings.manage'] })).toEqual({ ok: true });
  });
  it('refuses delegating a permission the grantor does not hold', () => {
    expect(validateDelegation({ ...base, delegatedPermissions: ['workforce.pay.approve'] })).toMatchObject({
      ok: false,
      code: 'DELEGATION_EXCEEDS_GRANT',
    });
  });
  it('refuses widening the grantor scope', () => {
    expect(
      validateDelegation({ ...base, delegationScope: UNITS_AB, grantorScope: UNITS_A, delegatedPermissions: ['workforce.bookings.manage'] }),
    ).toMatchObject({ ok: false, code: 'DELEGATION_SCOPE_WIDENS' });
  });
  it('refuses an empty delegation', () => {
    expect(validateDelegation({ ...base, delegatedPermissions: [] })).toMatchObject({ ok: false, code: 'DELEGATION_EMPTY' });
  });
  it('surfaces a bounds failure', () => {
    expect(
      validateDelegation({ ...base, delegatedPermissions: ['workforce.bookings.manage'], effectiveTo: '2026-10-20' }),
    ).toMatchObject({ ok: false, code: 'DELEGATION_BOUNDS_INVALID' });
  });
});
