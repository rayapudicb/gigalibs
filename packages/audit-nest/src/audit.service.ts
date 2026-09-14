import { Injectable } from '@nestjs/common';
import { prisma, type AuditAction, type Prisma } from '@gigalibs/db';
import {
  GENESIS_HASH,
  computeAuditRecordHash,
  verifyAuditChain,
  type AuditCryptographicProof,
  type ChainVerificationResult,
} from '../../audit-core/dist/index.js';

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
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  async log(params: CreateAuditLogParams) {
    let sequence = 1;
    let previousHash = GENESIS_HASH;

    if (params.tenantId) {
      const lastAudit = await prisma.auditLog.findFirst({
        where: { tenantId: params.tenantId },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      });

      if (lastAudit?.metadata && typeof lastAudit.metadata === 'object') {
        const proof = (lastAudit.metadata as Record<string, unknown>)
          .cryptographicProof as AuditCryptographicProof | undefined;
        if (proof && proof.recordHash) {
          sequence = (proof.sequence || 0) + 1;
          previousHash = proof.recordHash;
        }
      }
    }

    const recordHash = computeAuditRecordHash({
      tenantId: params.tenantId,
      sequence,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      userId: params.userId,
      before: params.before,
      after: params.after,
      previousHash,
    });

    const cryptographicProof: AuditCryptographicProof = {
      algorithm: 'SHA-256',
      sequence,
      previousHash,
      recordHash,
      sealedAt: new Date().toISOString(),
    };

    const metadata: Prisma.InputJsonValue = {
      ...(params.metadata || {}),
      cryptographicProof: cryptographicProof as unknown as Prisma.InputJsonValue,
    };

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
      metadata,
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

  async verifyTenantChain(tenantId: string): Promise<ChainVerificationResult> {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    return verifyAuditChain(logs);
  }
}
