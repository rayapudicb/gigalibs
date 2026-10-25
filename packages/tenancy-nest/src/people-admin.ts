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
