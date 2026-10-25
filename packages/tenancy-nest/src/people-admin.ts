import { type PeopleAdminRequest, type PeopleAdminResult, type PeopleAdminScope, assertDelegatedPeopleAdd } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

// WI-OI-120p slice 4 (R13): the DB-backed delegated people-add authorization. The head's units come from their signed
// context (their people:manage scope); this loads the per-unit allowances and the roles the head holds, then applies
// the pure rule (assertDelegatedPeopleAdd). The delegated invite/add flow calls this before creating anything.

type Reader = Pick<Prisma.TransactionClient, 'departmentRoleAllowance' | 'memberRoleAssignment'>;

/**
 * The delegated head's authority as the pure rule needs it: the units they manage, the roles allowed per unit (the
 * admin-set allowance), and the roles they themselves hold. Loaded once and reused for a whole bulk batch (R14) so
 * one add and a hundred adds cost the same two reads.
 */
export async function loadPeopleAdminScope(
  db: Reader,
  tenantId: string,
  headUserId: string,
  headUnits: readonly string[],
): Promise<PeopleAdminScope> {
  const allowances = await db.departmentRoleAllowance.findMany({
    where: { tenantId, unitId: { in: [...headUnits] } },
    select: { unitId: true, customRoleId: true },
  });
  const allowedRolesByUnit: Record<string, string[]> = {};
  for (const row of allowances) (allowedRolesByUnit[row.unitId] ??= []).push(row.customRoleId);

  const held = await db.memberRoleAssignment.findMany({
    where: { tenantId, userId: headUserId, revokedAt: null },
    select: { customRoleId: true },
  });

  return { units: headUnits, allowedRolesByUnit, heldRoleIds: [...new Set(held.map((row) => row.customRoleId))] };
}

export async function authorizeDelegatedPeopleAdd(
  db: Reader,
  tenantId: string,
  headUserId: string,
  headUnits: readonly string[],
  request: PeopleAdminRequest,
): Promise<PeopleAdminResult> {
  return assertDelegatedPeopleAdd(await loadPeopleAdminScope(db, tenantId, headUserId, headUnits), request);
}

export interface InvitedRoleAssignment {
  readonly customRoleId: string;
  readonly scope: 'UNITS';
  readonly unitIds: readonly string[];
}

/**
 * WI-OI-120p slice 4 (R13): the scoped role assignments an accepted delegated invitation grants. A delegated invite
 * carries custom roles and a unit (both authorized at create-time); on acceptance each role is granted at that unit.
 * An ordinary base-role invite carries neither and grants nothing here. Pure so acceptInvite's application is tested.
 */
export function invitedRoleAssignments(invitation: {
  readonly customRoleIds: readonly string[];
  readonly unitId: string | null;
}): readonly InvitedRoleAssignment[] {
  if (invitation.customRoleIds.length === 0 || !invitation.unitId) return [];
  const unitIds = [invitation.unitId];
  return [...new Set(invitation.customRoleIds)].map((customRoleId) => ({ customRoleId, scope: 'UNITS', unitIds }));
}
