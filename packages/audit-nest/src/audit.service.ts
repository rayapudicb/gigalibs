import { Injectable } from '@nestjs/common';
import { prisma, type AuditAction, type Prisma } from '@gigalibs/db';

export interface CreateAuditLogParams {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  userId?: string;
  tenantId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  async log(params: CreateAuditLogParams) {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: params.action,
      resource: params.resource,
      ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      ...(params.tenantId !== undefined ? { tenantId: params.tenantId } : {}),
      ...(params.before !== undefined ? { before: params.before as Prisma.InputJsonValue } : {}),
      ...(params.after !== undefined ? { after: params.after as Prisma.InputJsonValue } : {}),
      ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      ...(params.ipAddress !== undefined ? { ipAddress: params.ipAddress } : {}),
      ...(params.userAgent !== undefined ? { userAgent: params.userAgent } : {}),
    };

    return prisma.auditLog.create({
      data,
    });
  }

  async getTenantAuditLogs(tenantId: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
