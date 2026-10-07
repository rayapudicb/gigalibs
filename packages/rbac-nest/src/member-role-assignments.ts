import { isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

type AssignmentReader = Pick<Prisma.TransactionClient, 'memberRoleAssignment'>;

/**
 * WI-OI-120w (R2, ADR-0034): the roles a member holds, from their live role assignments, and the union of their
 * permissions; this replaces the single `tenant_members.customRoleId`. Only tenant permission codes are returned, never
 * a platform code. A role at a unit or place scope never carries a control-plane permission (the service refuses it),
 * so the control plane, which scopes nothing by unit, reads this union as before.
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
 * WI-OI-120w (R2 slices 3 and 2b, ADR-0034 §5): every live assignment, one by one, oldest first, with its own tenant
 * permission codes and where it applies. `permissions` is the union over all of them: a route asks whether the member
 * holds a permission anywhere; where it may be used is decided per module from the scopes (slice 2b) or per
 * assignment (`scopeFor`).
 */
export async function memberRoleGrants(
  db: AssignmentReader,
  tenantId: string,
  userId: string,
): Promise<{
  readonly names: string[];
  readonly permissions: string[];
  readonly assignments: readonly {
    readonly permissions: readonly string[];
    readonly scope: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES';
    readonly unitIds: readonly string[];
    readonly placeIds: readonly string[];
  }[];
}> {
  const rows = await db.memberRoleAssignment.findMany({
    where: { tenantId, userId, revokedAt: null },
    select: { scope: true, unitIds: true, placeIds: true, customRole: { select: { name: true, permissions: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const names: string[] = [];
  const permissions = new Set<string>();
  const assignments: { permissions: string[]; scope: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES'; unitIds: string[]; placeIds: string[] }[] = [];
  for (const { customRole, scope, unitIds, placeIds } of rows) {
    if (!names.includes(customRole.name)) names.push(customRole.name);
    const own = Array.isArray(customRole.permissions) ? [...new Set(customRole.permissions.filter(isTenantPermissionCode))] : [];
    for (const code of own) permissions.add(code);
    assignments.push({ permissions: own, scope, unitIds: [...unitIds], placeIds: [...placeIds] });
  }
  return { names, permissions: [...permissions], assignments };
}
