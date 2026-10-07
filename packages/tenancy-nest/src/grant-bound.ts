import { baseRoleAdditions, baseRolePermissions, holdsPermission, isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';
import { memberRoleGrants, memberScopeRoles, resolveBaseRolePermissions } from '@gigalibs/rbac-nest';
import { ForbiddenException } from '@nestjs/common';

const WORKSPACE_ADMINISTRATORS = new Set(['TENANT_ADMIN', 'SUPER_ADMIN']);

/** A Tenant Admin or Super Admin: only another administrator changes, suspends or removes one (WI-OI-120v, 120x L3). */
export function isWorkspaceAdministrator(role: string): boolean {
  return WORKSPACE_ADMINISTRATORS.has(role);
}

/**
 * What an actor may give: an active workspace administrator anything; anyone else what they hold, counted as the guard
 * counts it (base role, live role assignments and direct codes). An inactive or missing actor holds nothing.
 */
export async function ownAuthority(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
): Promise<{ readonly administrator: boolean; readonly holds: (code: unknown) => boolean }> {
  const actor = await tx.tenantMember.findUnique({
    where: { userId_tenantId: { userId: actorUserId, tenantId } },
    select: { role: true, status: true, permissions: true },
  });
  if (actor?.status !== 'ACTIVE') return { administrator: false, holds: () => false };
  if (isWorkspaceAdministrator(actor.role)) return { administrator: true, holds: () => true };
  // Security review of slice 2b (M1): a role held only at some units or places gives nothing to pass on to others,
  // whose scope may be wider; only roles held at the actor's own scope or the whole workspace count.
  const { assignments } = await memberRoleGrants(tx, tenantId, actorUserId);
  const own = [
    ...resolveBaseRolePermissions([actor.role]),
    ...assignments.filter((assignment) => assignment.scope === 'MEMBER' || assignment.scope === 'WORKSPACE').flatMap((assignment) => assignment.permissions),
    ...(actor.permissions ?? []).filter(isTenantPermissionCode),
  ];
  return { administrator: false, holds: (code) => holdsPermission(own, code) };
}

/**
 * WI-OI-120w (owner, 2026-10-06: "add the grant bound"; Security review of 2a, M3): someone who is not an active
 * workspace administrator gives only what they hold themselves, whether by giving a member a role or by adding
 * permissions to a role. Without it, two holders of `roles:assign` could pass each other a role carrying `roles:*`. R4
 * replaces this with bounds per assignment. Caller holds the tenant row lock.
 */
export async function assertGrantWithinOwn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  granted: readonly unknown[],
): Promise<void> {
  if (granted.length === 0) return;
  const authority = await ownAuthority(tx, tenantId, actorUserId);
  const beyond = [...new Set(granted.filter((code) => !authority.holds(code)).map(String))];
  if (beyond.length > 0)
    throw new ForbiddenException({
      code: 'GRANT_BEYOND_OWN',
      message: `You can only give permissions you hold yourself; you do not hold ${beyond.join(', ')}.`,
      missing: beyond,
    });
}

/**
 * WI-OI-120x: the same bound for base roles. Moving a member from `current` (null: a new member) to `next` gives the
 * permissions `next` adds; someone who is not a Tenant Admin must hold them all. Lowering a role adds none.
 */
export async function assertBaseRoleWithinOwn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  current: string | null,
  next: string,
): Promise<void> {
  if (current === next) return;
  await assertGrantWithinOwn(tx, tenantId, actorUserId, baseRoleAdditions(current, next));
}

/**
 * WI-OI-120x: someone who is not an active Tenant Admin does not change their own access: base role, department,
 * places or unit grants. Another administrator does it for them.
 */
export async function assertNotOwnAccess(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  memberUserId: string,
): Promise<void> {
  if (actorUserId !== memberUserId) return;
  const actor = await tx.tenantMember.findUnique({
    where: { userId_tenantId: { userId: actorUserId, tenantId } },
    select: { role: true, status: true },
  });
  if (actor?.status === 'ACTIVE' && isWorkspaceAdministrator(actor.role)) return;
  throw new ForbiddenException({
    code: 'SELF_ACCESS_CHANGE',
    message: 'You cannot change your own role, department, places or units; ask an administrator.',
  });
}

/**
 * WI-OI-120x (review M2): bringing a suspended member back gives them again their base role, their live role
 * assignments and their direct codes, so it is bounded as a new grant of all three.
 */
export async function assertReactivationWithinOwn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  member: { readonly userId: string; readonly role: string; readonly permissions: readonly string[] },
): Promise<void> {
  await assertGrantWithinOwn(tx, tenantId, actorUserId, [
    ...baseRolePermissions(member.role),
    ...(await memberScopeRoles(tx, tenantId, member.userId)).permissions,
    ...member.permissions.filter(isTenantPermissionCode),
  ]);
}

