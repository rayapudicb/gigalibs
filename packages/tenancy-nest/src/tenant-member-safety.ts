import type { Prisma } from '@gigalibs/db';
import { ConflictException } from '@nestjs/common';

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
