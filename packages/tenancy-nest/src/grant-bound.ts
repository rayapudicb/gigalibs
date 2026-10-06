import { holdsPermission, isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';
import { memberScopeRoles, resolveBaseRolePermissions } from '@gigalibs/rbac-nest';
import { ForbiddenException } from '@nestjs/common';

const WORKSPACE_ADMINISTRATORS = new Set(['TENANT_ADMIN', 'SUPER_ADMIN']);

/**
 * WI-OI-120w (owner, 2026-10-06: "add the grant bound"; Security review of 2a, M3): someone who is not an active
 * workspace administrator gives only what they hold themselves, whether by giving a member a role or by adding
 * permissions to a role. Their own permissions are counted as the guard counts them: base role, live role assignments
 * and direct codes. Without it, two holders of `roles:assign` could pass each other a role carrying `roles:*`. R4
 * replaces this with bounds per assignment. Caller holds the tenant row lock.
 */
export async function assertGrantWithinOwn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  granted: readonly unknown[],
): Promise<void> {
  if (granted.length === 0) return;
  const actor = await tx.tenantMember.findUnique({
    where: { userId_tenantId: { userId: actorUserId, tenantId } },
    select: { role: true, status: true, permissions: true },
  });
  if (actor?.status === 'ACTIVE' && WORKSPACE_ADMINISTRATORS.has(actor.role)) return;
  const own =
    actor?.status === 'ACTIVE'
      ? [
          ...resolveBaseRolePermissions([actor.role]),
          ...(await memberScopeRoles(tx, tenantId, actorUserId)).permissions,
          ...(actor.permissions ?? []).filter(isTenantPermissionCode),
        ]
      : [];
  const beyond = granted.filter((code) => !holdsPermission(own, code)).map(String);
  if (beyond.length > 0)
    throw new ForbiddenException({
      code: 'GRANT_BEYOND_OWN',
      message: `You can only give permissions you hold yourself; you do not hold ${beyond.join(', ')}.`,
      missing: beyond,
    });
}
