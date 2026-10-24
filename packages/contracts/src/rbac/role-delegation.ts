import { holdsPermission } from './permission-match.js';

// WI-OI-120hq (R4, delegation & revocation): the pure rules for delegating a role to another member for a bounded
// time. A delegation may grant only permissions the grantor holds, only within the grantor's own scope, and only for
// a bounded future window. The control plane also runs the R3 duty-conflict check on the delegate's resulting
// permissions, carries a live delegation in the signed context as an ordinary assignment, and bounds the context's
// `exp` to the delegation's end — those parts live in the control plane; the rules below are pure and testable here.

export type DelegationScope =
  | { readonly kind: 'MEMBER' }
  | { readonly kind: 'WORKSPACE' | 'TENANT' }
  | { readonly kind: 'UNITS'; readonly unitIds: readonly string[] }
  | { readonly kind: 'PLACES'; readonly placeIds: readonly string[] };

/** Whether `inner` is within `outer`: a workspace-wide scope contains any; otherwise same kind and a subset of ids. */
export function scopeWithin(inner: DelegationScope, outer: DelegationScope): boolean {
  if (outer.kind === 'WORKSPACE' || outer.kind === 'TENANT') return true;
  if (inner.kind === 'UNITS' && outer.kind === 'UNITS')
    return inner.unitIds.length > 0 && inner.unitIds.every((id) => outer.unitIds.includes(id));
  if (inner.kind === 'PLACES' && outer.kind === 'PLACES')
    return inner.placeIds.length > 0 && inner.placeIds.every((id) => outer.placeIds.includes(id));
  // Any other combination (different kinds, or a wider kind inside a narrower one) is not within.
  return inner.kind === outer.kind && inner.kind === 'MEMBER';
}

export type DelegationResult = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

const fail = (code: string, message: string): DelegationResult => ({ ok: false, code, message });

/** The delegation's time window is valid: a real start before its end, not already ended, within the horizon. */
export function delegationBounds(
  effectiveFrom: string | Date,
  effectiveTo: string | Date,
  now: Date,
  maxHorizonDays: number,
): DelegationResult {
  const from = new Date(effectiveFrom).getTime();
  const to = new Date(effectiveTo).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return fail('DELEGATION_BOUNDS_INVALID', 'The delegation needs a valid start and end.');
  if (from >= to) return fail('DELEGATION_BOUNDS_INVALID', 'The delegation must end after it starts.');
  if (to <= now.getTime()) return fail('DELEGATION_BOUNDS_INVALID', 'The delegation has already ended.');
  if (to - from > maxHorizonDays * 86_400_000) return fail('DELEGATION_TOO_LONG', `A delegation lasts at most ${maxHorizonDays} days.`);
  return { ok: true };
}

export interface DelegationRequest {
  readonly grantorPermissions: readonly string[];
  readonly delegatedPermissions: readonly string[];
  readonly grantorScope: DelegationScope;
  readonly delegationScope: DelegationScope;
  readonly effectiveFrom: string | Date;
  readonly effectiveTo: string | Date;
  readonly now: Date;
  readonly maxHorizonDays: number;
}

/**
 * Validates a delegation's within-own, scope and bounds rules (not the R3 duty-conflict check, which the caller runs
 * on the delegate's resulting permissions). Returns ok, or the first rule it breaks.
 */
export function validateDelegation(request: DelegationRequest): DelegationResult {
  if (request.delegatedPermissions.length === 0)
    return fail('DELEGATION_EMPTY', 'A delegation must grant at least one permission.');
  const beyond = request.delegatedPermissions.filter((code) => !holdsPermission(request.grantorPermissions, code));
  if (beyond.length > 0)
    return fail('DELEGATION_EXCEEDS_GRANT', `You cannot delegate permissions you do not hold: ${beyond.join(', ')}.`);
  if (!scopeWithin(request.delegationScope, request.grantorScope))
    return fail('DELEGATION_SCOPE_WIDENS', 'A delegation cannot widen your own scope.');
  return delegationBounds(request.effectiveFrom, request.effectiveTo, request.now, request.maxHorizonDays);
}
