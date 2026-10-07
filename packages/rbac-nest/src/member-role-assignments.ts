import { isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

type AssignmentReader = Pick<Prisma.TransactionClient, 'memberRoleAssignment'>;

/**
 * WI-OI-120w (R2 slice 1, ADR-0034): the roles a member holds at their own scope (`MEMBER`), from their live role
 * assignments; this replaces the single `tenant_members.customRoleId`. Assignments at an explicit scope (`WORKSPACE`,
 * `UNITS`, `PLACES`) are evaluated per assignment from slice 3 and are not part of the member-wide permissions; none
 * exist before then. Only tenant permission codes are returned, never a platform code.
 */
export async function memberScopeRoles(
  db: AssignmentReader,
  tenantId: string,
  userId: string,
): Promise<{ readonly names: string[]; readonly permissions: string[] }> {
  const { names, permissions } = await memberRoleGrants(db, tenantId, userId);
  return { names, permissions };
}

/**
 * WI-OI-120w (R2 slice 3, ADR-0034 §5): the same live `MEMBER` assignments, also one by one, for the signed context's
 * assignment claims: each assignment's own tenant permission codes, oldest first.
 */
export async function memberRoleGrants(
  db: AssignmentReader,
  tenantId: string,
  userId: string,
): Promise<{
  readonly names: string[];
  readonly permissions: string[];
  readonly assignments: readonly { readonly permissions: readonly string[] }[];
}> {
  const rows = await db.memberRoleAssignment.findMany({
    where: { tenantId, userId, revokedAt: null, scope: 'MEMBER' },
    select: { customRole: { select: { name: true, permissions: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const names: string[] = [];
  const permissions = new Set<string>();
  const assignments: { permissions: string[] }[] = [];
  for (const { customRole } of rows) {
    names.push(customRole.name);
    const own = Array.isArray(customRole.permissions) ? [...new Set(customRole.permissions.filter(isTenantPermissionCode))] : [];
    for (const code of own) permissions.add(code);
    assignments.push({ permissions: own });
  }
  return { names, permissions: [...permissions], assignments };
}
