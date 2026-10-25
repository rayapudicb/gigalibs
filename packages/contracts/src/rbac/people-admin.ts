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

export interface BulkPersonRow {
  readonly email: string;
  readonly unit: string;
  readonly roleIds: readonly string[];
  readonly name?: string | undefined;
}

export interface BulkRowError {
  readonly index: number;
  readonly email: string;
  readonly code: string;
  readonly message: string;
}

export interface BulkValidation {
  readonly ok: boolean;
  readonly errors: readonly BulkRowError[];
}

/**
 * WI-OI-120p slice 5 (R14, bulk add): check every row against the delegated rule before anything is created. A batch
 * is all-or-nothing — if any row fails (bad/duplicate/already-a-member email, no roles, or a delegated-add refusal),
 * `ok` is false and the caller creates nothing. `existingEmails` are the tenant's current member emails (lower-cased).
 */
export function validateBulkPeopleAdd(
  rows: readonly BulkPersonRow[],
  scope: PeopleAdminScope,
  existingEmails: ReadonlySet<string>,
): BulkValidation {
  const errors: BulkRowError[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const email = row.email.trim().toLowerCase();
    const add = (code: string, message: string) => errors.push({ index, email, code, message });
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) add('BULK_INVALID_EMAIL', 'A valid email is required.');
    else if (seen.has(email)) add('BULK_DUPLICATE_EMAIL', 'This email appears more than once in the batch.');
    else if (existingEmails.has(email)) add('BULK_ALREADY_MEMBER', 'This email is already a member of the workspace.');
    seen.add(email);
    if (row.roleIds.length === 0) add('BULK_NO_ROLES', 'At least one role is required.');
    const authorized = assertDelegatedPeopleAdd(scope, { unit: row.unit, roleIds: row.roleIds });
    if (!authorized.ok) add(authorized.code, authorized.message);
  });
  return { ok: errors.length === 0, errors };
}

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
