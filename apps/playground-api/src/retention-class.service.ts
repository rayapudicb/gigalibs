import type {
  AssignRetentionClassDto,
  CreateRetentionClassDto,
  UpdateRetentionClassDto,
} from '@gigalibs/contracts';
import { type AuditAction, Prisma, prisma } from '@gigalibs/db';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveTenantId } from './tenant-resolver.js';

// WI-OI-120 (T9b): named retention classes — the reusable "how long, and on what basis" an environment adopts so the
// purge uses its period. A legal hold still overrides any class (enforced in the purge worker). The default-class
// invariant (at most one live default per tenant) is held both here and by a partial unique index in the schema.
@Injectable()
export class RetentionClassService {
  async list(tenantId: string, includeArchived = false) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.retentionClass.findMany({
      where: { tenantId: resolvedTenantId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, userId: string, dto: CreateRetentionClassDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma
      .$transaction(
        async (transaction) => {
          if (dto.isDefault) await this.clearDefault(transaction, resolvedTenantId);
          const created = await transaction.retentionClass.create({
            data: {
              tenantId: resolvedTenantId,
              key: dto.key,
              name: dto.name,
              description: dto.description ?? null,
              retentionDays: dto.retentionDays,
              basis: dto.basis,
              isDefault: dto.isDefault,
              createdById: userId,
            },
          });
          await this.audit(transaction, resolvedTenantId, userId, 'CREATE', created.id, {
            key: created.key,
            retentionDays: created.retentionDays,
            basis: created.basis,
            isDefault: created.isDefault,
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error) => {
        throw this.translate(error, dto.key);
      });
  }

  async update(tenantId: string, userId: string, classId: string, dto: UpdateRetentionClassDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.$transaction(
      async (transaction) => {
        const current = await transaction.retentionClass.findFirst({
          where: { id: classId, tenantId: resolvedTenantId },
        });
        if (!current) throw new NotFoundException(`Retention class '${classId}' was not found.`);
        if (current.archivedAt)
          throw new ConflictException(`Retention class '${classId}' is archived.`);
        if (dto.isDefault) await this.clearDefault(transaction, resolvedTenantId, classId);
        const updated = await transaction.retentionClass.update({
          where: { id: current.id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.description === undefined ? {} : { description: dto.description }),
            ...(dto.retentionDays === undefined ? {} : { retentionDays: dto.retentionDays }),
            ...(dto.basis === undefined ? {} : { basis: dto.basis }),
            ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
          },
        });
        await this.audit(transaction, resolvedTenantId, userId, 'UPDATE', updated.id, {
          name: updated.name,
          retentionDays: updated.retentionDays,
          basis: updated.basis,
          isDefault: updated.isDefault,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Soft-archive: the class stops being offered, any environment adopting it falls back to its bare period, and the
   *  default flag is cleared so a new default can be set. Executions keep pointing at it for the audit trail. */
  async archive(tenantId: string, userId: string, classId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.$transaction(
      async (transaction) => {
        const current = await transaction.retentionClass.findFirst({
          where: { id: classId, tenantId: resolvedTenantId },
        });
        if (!current) throw new NotFoundException(`Retention class '${classId}' was not found.`);
        if (current.archivedAt) return current;
        await transaction.tenantEnvironment.updateMany({
          where: { tenantId: resolvedTenantId, retentionClassId: current.id },
          data: { retentionClassId: null },
        });
        const archived = await transaction.retentionClass.update({
          where: { id: current.id },
          data: { archivedAt: new Date(), isDefault: false },
        });
        await this.audit(transaction, resolvedTenantId, userId, 'DELETE', archived.id, {
          key: archived.key,
          archivedAt: archived.archivedAt?.toISOString(),
        });
        return archived;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Point an environment at a class (or clear it with null). Both must belong to the tenant; the class must be live. */
  async assign(tenantId: string, userId: string, dto: AssignRetentionClassDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.$transaction(
      async (transaction) => {
        const environment = await transaction.tenantEnvironment.findFirst({
          where: { id: dto.environmentId, tenantId: resolvedTenantId },
          select: { id: true, retentionClassId: true },
        });
        if (!environment)
          throw new NotFoundException(`Environment '${dto.environmentId}' was not found.`);
        if (dto.retentionClassId !== null) {
          const target = await transaction.retentionClass.findFirst({
            where: { id: dto.retentionClassId, tenantId: resolvedTenantId },
            select: { id: true, archivedAt: true },
          });
          if (!target)
            throw new NotFoundException(`Retention class '${dto.retentionClassId}' was not found.`);
          if (target.archivedAt)
            throw new BadRequestException('An archived retention class cannot be adopted.');
        }
        const updated = await transaction.tenantEnvironment.update({
          where: { id: environment.id },
          data: { retentionClassId: dto.retentionClassId },
          select: { id: true, retentionClassId: true },
        });
        await this.audit(transaction, resolvedTenantId, userId, 'UPDATE', environment.id, {
          resource: 'tenant-environment-retention-class',
          before: environment.retentionClassId,
          after: updated.retentionClassId,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async clearDefault(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    exceptId?: string,
  ) {
    await transaction.retentionClass.updateMany({
      where: {
        tenantId,
        isDefault: true,
        archivedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    action: AuditAction,
    resourceId: string,
    after: Prisma.InputJsonValue,
  ) {
    await transaction.auditLog.create({
      data: { tenantId, userId, action, resource: 'retention-class', resourceId, after },
    });
  }

  private translate(error: unknown, key: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('one_default'))
          return new ConflictException(
            'A default retention class already exists for this workspace.',
          );
        return new ConflictException(`A retention class with key '${key}' already exists.`);
      }
    }
    return error instanceof Error ? error : new Error('Retention class operation failed.');
  }
}
