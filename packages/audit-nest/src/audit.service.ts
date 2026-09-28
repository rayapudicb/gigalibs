import { Injectable } from '@nestjs/common';
import { Prisma, prisma, type AuditAction } from '@gigalibs/db';
import {
  GENESIS_HASH,
  computeAuditRecordHash,
  createAuditEvidenceV1,
  redactSensitiveFields,
  verifyAuditChain,
  type AuditCryptographicProof,
  type ChainVerificationResult,
} from '@gigalibs/audit-core';

export interface CreateAuditLogParams {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  userId?: string;
  tenantId?: string;
  chainScope?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class AuditService {
  async log(params: CreateAuditLogParams) {
    const db = params.tx ?? prisma;
    let sequence = 1;
    let previousHash = GENESIS_HASH;

    let sanitizedBefore = params.before;
    let sanitizedAfter = params.after;
    const redactedFields: string[] = [];

    if (params.before) {
      const red = redactSensitiveFields(params.before);
      sanitizedBefore = red.sanitized as Record<string, unknown>;
      redactedFields.push(...red.redactedFields);
    }
    if (params.after) {
      const red = redactSensitiveFields(params.after);
      sanitizedAfter = red.sanitized as Record<string, unknown>;
      redactedFields.push(...red.redactedFields);
    }

    if (params.tenantId) {
      const scope = params.chainScope ?? 'default';
      try {
        const rows = await db.$queryRaw<Array<{ lastSequence: bigint | number; headHash: string }>>(
          Prisma.sql`
            SELECT "lastSequence", "headHash"
            FROM "tenant_audit_chains"
            WHERE "tenantId" = ${params.tenantId} AND "chainScope" = ${scope}
            FOR UPDATE
          `,
        );

        if (rows && rows.length > 0) {
          const current = rows[0]!;
          sequence = Number(current.lastSequence) + 1;
          previousHash = current.headHash;
        } else {
          sequence = 1;
          previousHash = GENESIS_HASH;
        }
      } catch {
        const lastAudit = await (db as any).auditLog.findFirst({
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
    }

    const recordHash = computeAuditRecordHash({
      tenantId: params.tenantId,
      sequence,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      userId: params.userId,
      before: sanitizedBefore,
      after: sanitizedAfter,
      previousHash,
    });

    const cryptographicProof: AuditCryptographicProof = {
      algorithm: 'SHA-256',
      sequence,
      previousHash,
      recordHash,
      sealedAt: new Date().toISOString(),
    };

    const evidence = createAuditEvidenceV1({
      tenantId: params.tenantId ?? 'system',
      chainScope: params.chainScope ?? 'default',
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      actorUserId: params.userId,
      correlationId: params.correlationId,
      before: sanitizedBefore,
      after: sanitizedAfter,
      redactedFields: [...new Set(redactedFields)],
      proof: cryptographicProof,
    });

    if (params.tenantId) {
      const scope = params.chainScope ?? 'default';
      try {
        await db.$executeRaw(
          Prisma.sql`
            INSERT INTO "tenant_audit_chains" ("id", "tenantId", "chainScope", "lastSequence", "headHash", "sealedCount", "updatedAt")
            VALUES (${`${params.tenantId}:${scope}`}, ${params.tenantId}, ${scope}, ${sequence}, ${recordHash}, 1, NOW())
            ON CONFLICT ("tenantId", "chainScope") DO UPDATE
            SET "lastSequence" = ${sequence}, "headHash" = ${recordHash}, "sealedCount" = "tenant_audit_chains"."sealedCount" + 1, "updatedAt" = NOW()
          `,
        );
      } catch {
        // Continue execution if checkpoint persistence is unavailable
      }
    }

    const metadata: Prisma.InputJsonValue = {
      ...(params.metadata || {}),
      cryptographicProof: cryptographicProof as unknown as Prisma.InputJsonValue,
      auditEvidence: evidence as unknown as Prisma.InputJsonValue,
    };

    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: params.action,
      resource: params.resource,
      ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      ...(params.tenantId !== undefined ? { tenantId: params.tenantId } : {}),
      ...(sanitizedBefore !== undefined ? { before: sanitizedBefore as Prisma.InputJsonValue } : {}),
      ...(sanitizedAfter !== undefined ? { after: sanitizedAfter as Prisma.InputJsonValue } : {}),
      ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      ...(params.ipAddress !== undefined ? { ipAddress: params.ipAddress } : {}),
      ...(params.userAgent !== undefined ? { userAgent: params.userAgent } : {}),
      metadata,
    };

    return (db as any).auditLog.create({
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
