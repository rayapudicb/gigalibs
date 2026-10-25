import { type PeopleAdminRequest, type PeopleAdminResult, assertDelegatedPeopleAdd } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

// WI-OI-120p slice 4 (R13): the DB-backed delegated people-add authorization. The head's units come from their signed
// context (their people:manage scope); this loads the per-unit allowances and the roles the head holds, then applies
// the pure rule (assertDelegatedPeopleAdd). The delegated invite/add flow calls this before creating anything.

type Reader = Pick<Prisma.TransactionClient, 'departmentRoleAllowance' | 'memberRoleAssignment'>;

export async function authorizeDelegatedPeopleAdd(
  db: Reader,
  tenantId: string,
  headUserId: string,
  headUnits: readonly string[],
  request: PeopleAdminRequest,
): Promise<PeopleAdminResult> {
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

  return assertDelegatedPeopleAdd(
    { units: headUnits, allowedRolesByUnit, heldRoleIds: [...new Set(held.map((row) => row.customRoleId))] },
    request,
  );
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
