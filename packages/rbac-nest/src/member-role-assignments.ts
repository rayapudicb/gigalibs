import { isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';

type AssignmentReader = Pick<Prisma.TransactionClient, 'memberRoleAssignment' | '$queryRaw'>;

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
    select: { customRoleId: true, scope: true, unitIds: true, placeIds: true, customRole: { select: { name: true, permissions: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  // WI-OI-120w (R2 slice 2c): a role also grants what the roles it includes grant, at the scope it is held.
  const included = rows.length > 0 ? await includedRolePermissions(db, tenantId, rows.map((row) => row.customRoleId)) : new Map<string, string[]>();
  const names: string[] = [];
  const permissions = new Set<string>();
  const assignments: { permissions: string[]; scope: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES'; unitIds: string[]; placeIds: string[] }[] = [];
  for (const { customRoleId, customRole, scope, unitIds, placeIds } of rows) {
    if (!names.includes(customRole.name)) names.push(customRole.name);
    const stored = Array.isArray(customRole.permissions) ? customRole.permissions.filter(isTenantPermissionCode) : [];
    const own = [...new Set([...stored, ...(included.get(customRoleId) ?? [])])];
    for (const code of own) permissions.add(code);
    assignments.push({ permissions: own, scope, unitIds: [...unitIds], placeIds: [...placeIds] });
  }
  return { names, permissions: [...permissions], assignments };
}

/** The deepest inclusion followed (the service refuses saving anything deeper). */
const INCLUSION_DEPTH = 5;

/**
 * WI-OI-120w (R2 slice 2c, ADR-0034 §2): for each of `roleIds`, the tenant permission codes of every role it includes,
 * transitively and at most five deep. A role absent from the map includes nothing.
 */
export async function includedRolePermissions(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  tenantId: string,
  roleIds: readonly string[],
): Promise<Map<string, string[]>> {
  const rows = await db.$queryRaw<Array<{ roleId: string; permissions: unknown }>>`
    WITH RECURSIVE reach("root", "roleId", "depth") AS (
      SELECT i."roleId", i."includedRoleId", 1 FROM custom_role_inclusions i
       WHERE i."tenantId" = ${tenantId} AND i."roleId" = ANY(${[...new Set(roleIds)]}::text[])
      UNION
      SELECT reach."root", i."includedRoleId", reach."depth" + 1 FROM reach
        JOIN custom_role_inclusions i ON i."tenantId" = ${tenantId} AND i."roleId" = reach."roleId"
       WHERE reach."depth" < ${INCLUSION_DEPTH}
    )
    SELECT DISTINCT reach."root" AS "roleId", r.permissions FROM reach
      JOIN custom_roles r ON r."tenantId" = ${tenantId} AND r.id = reach."roleId"`;
  const included = new Map<string, string[]>();
  for (const row of rows) {
    const codes = Array.isArray(row.permissions) ? row.permissions.filter(isTenantPermissionCode) : [];
    included.set(row.roleId, [...new Set([...(included.get(row.roleId) ?? []), ...codes])]);
  }
  return included;
}

