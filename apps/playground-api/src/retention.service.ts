import type { CreateRetentionHoldDto, ReleaseRetentionHoldDto } from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { resolveTenantId } from './tenant-resolver.js';

@Injectable()
export class RetentionService {
  async list(tenantId: string, environmentId?: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    if (environmentId) await this.requireEnvironment(resolvedTenantId, environmentId);
    return prisma.dataRetentionHold.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(environmentId ? { environmentId } : {}),
      },
      orderBy: { placedAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateRetentionHoldDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    await this.requireEnvironment(resolvedTenantId, dto.environmentId);
    return prisma.$transaction(
      async (transaction) => {
        const hold = await transaction.dataRetentionHold.create({
          data: {
            tenantId: resolvedTenantId,
            environmentId: dto.environmentId,
            reason: dto.reason,
            placedById: userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'data-retention-hold',
            resourceId: hold.id,
            after: {
              environmentId: hold.environmentId,
              status: hold.status,
              reason: hold.reason,
            },
          },
        });
        return hold;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async release(
    tenantId: string,
    userId: string,
    holdId: string,
    dto: ReleaseRetentionHoldDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.$transaction(
      async (transaction) => {
        const hold = await transaction.dataRetentionHold.findFirst({
          where: { id: holdId, tenantId: resolvedTenantId },
        });
        if (!hold) throw new NotFoundException(`Retention hold '${holdId}' was not found.`);
        if (hold.status !== 'ACTIVE') {
          throw new ConflictException(`Retention hold '${holdId}' has already been released.`);
        }
        const releasedAt = new Date();
        const result = await transaction.dataRetentionHold.updateMany({
          where: { id: hold.id, tenantId: resolvedTenantId, status: 'ACTIVE' },
          data: {
            status: 'RELEASED',
            releasedById: userId,
            releaseReason: dto.reason,
            releasedAt,
          },
        });
        if (result.count !== 1) {
          throw new ConflictException(`Retention hold '${holdId}' changed concurrently.`);
        }
        const released = await transaction.dataRetentionHold.findUniqueOrThrow({
          where: { id: hold.id },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'STATUS_CHANGE',
            resource: 'data-retention-hold',
            resourceId: hold.id,
            before: { status: hold.status },
            after: {
              status: released.status,
              releasedAt: released.releasedAt?.toISOString(),
              releaseReason: released.releaseReason,
            },
          },
        });
        return released;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireEnvironment(tenantId: string, environmentId: string) {
    const environment = await prisma.tenantEnvironment.findFirst({
      where: { id: environmentId, tenantId },
      select: { id: true },
    });
    if (!environment) {
      throw new NotFoundException(`Environment '${environmentId}' was not found.`);
    }
    return environment;
  }
}
