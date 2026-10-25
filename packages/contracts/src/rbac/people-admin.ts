// WI-OI-120p slice 4 (R13, delegated people administration): the pure rule for what a delegated department head may
// do when adding or inviting a person. A head holds `people:manage` scoped to their units; a Tenant Admin sets, per
// unit, which roles the head may assign (the department allowance). A head may add a person only into a unit they
// manage, only with roles on that unit's allowance, never a role they do not themselves hold, and never a base role
// above MEMBER (so never Tenant Admin). The control-plane wiring (the permission, the allowance table, the delegated
// invite/add flow) calls this; the rule itself is pure and testable here.

export interface PeopleAdminScope {
  /** The units the head manages (their `people:manage` scope). */
  readonly units: readonly string[];
  /** Per unit, the role ids a head may assign there, set by a Tenant Admin (the department allowance). */
  readonly allowedRolesByUnit: Readonly<Record<string, readonly string[]>>;
  /** The custom-role ids the head holds — they may never assign beyond these (no escalation). */
  readonly heldRoleIds: readonly string[];
}

export interface PeopleAdminRequest {
  readonly unit: string;
  readonly roleIds: readonly string[];
  /** The base role being set, if any. A delegated head adds members only. */
  readonly baseRole?: string;
}

export type PeopleAdminResult = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

const fail = (code: string, message: string): PeopleAdminResult => ({ ok: false, code, message });

/** Whether a delegated head may add/invite a person into `request.unit` with `request.roleIds`, or the first rule broken. */
export function assertDelegatedPeopleAdd(scope: PeopleAdminScope, request: PeopleAdminRequest): PeopleAdminResult {
  if (request.baseRole !== undefined && request.baseRole !== 'MEMBER')
    return fail('PEOPLE_ADMIN_NO_BASE_ROLE', 'A delegated head adds members only; a base role above MEMBER needs an administrator.');
  if (!scope.units.includes(request.unit))
    return fail('PEOPLE_ADMIN_OUT_OF_UNIT', 'You can add people only into a unit you manage.');
  const allowed = scope.allowedRolesByUnit[request.unit] ?? [];
  const notAllowed = request.roleIds.filter((role) => !allowed.includes(role));
  if (notAllowed.length > 0)
    return fail('PEOPLE_ADMIN_ROLE_NOT_ALLOWED', `These roles are not on the unit's assignable list: ${notAllowed.join(', ')}.`);
  const beyond = request.roleIds.filter((role) => !scope.heldRoleIds.includes(role));
  if (beyond.length > 0)
    return fail('PEOPLE_ADMIN_ESCALATION', `You cannot assign roles you do not hold: ${beyond.join(', ')}.`);
  return { ok: true };
}
