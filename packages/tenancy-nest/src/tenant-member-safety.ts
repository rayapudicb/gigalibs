import type { Prisma } from '@gigalibs/db';
import { ConflictException, ForbiddenException } from '@nestjs/common';

const WORKSPACE_ADMINISTRATORS = new Set(['TENANT_ADMIN', 'SUPER_ADMIN']);

/**
 * WI-OI-120v: only an active workspace administrator may make someone a Tenant Admin, or change, suspend or remove a
 * member who is one. `users:update`, `invites:create` or SCIM permissions alone manage everyone else; before this, any
 * holder of them could make anyone, themselves included, a Tenant Admin. Caller holds the tenant row lock.
 */
export async function assertTenantAdminAuthority(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorUserId: string,
  change: { readonly grantsAdmin: boolean; readonly touchesAdmin: boolean },
): Promise<void> {
  if (!change.grantsAdmin && !change.touchesAdmin) return;
  const actor = await tx.tenantMember.findUnique({
    where: { userId_tenantId: { userId: actorUserId, tenantId } },
    select: { role: true, status: true },
  });
  if (actor?.status === 'ACTIVE' && WORKSPACE_ADMINISTRATORS.has(actor.role)) return;
  throw new ForbiddenException({
    code: 'TENANT_ADMIN_ONLY',
    message: change.grantsAdmin
      ? 'Only a workspace administrator can make someone a workspace administrator.'
      : 'Only a workspace administrator can change, suspend or remove a workspace administrator.',
  });
}

/** Caller must hold the tenant row lock for the entire membership change transaction. */
export async function assertTenantAdministratorRetained(
  tx: Prisma.TransactionClient,
  tenantId: string,
  member: { id: string; role: string; status: string },
  next: { role: string; status: string } | null,
) {
  if (member.role !== 'TENANT_ADMIN' || member.status !== 'ACTIVE') return;
  if (next?.role === 'TENANT_ADMIN' && next.status === 'ACTIVE') return;
  const otherAdmins = await tx.tenantMember.count({
    where: { tenantId, id: { not: member.id }, role: 'TENANT_ADMIN', status: 'ACTIVE' },
  });
  if (otherAdmins === 0) throw new ConflictException('The last active tenant administrator cannot be changed');
}
