import { createHash, randomBytes } from 'node:crypto';
import { type Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

const REQUEST_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const GRANT_LIFETIME_MS = 30 * 60 * 1_000;

@Injectable()
export class MfaAssistedRecoveryService {
  async list(tenantId: string) {
    await this.expireStale(tenantId);
    return prisma.mfaAssistedRecovery.findMany({
      where: { tenantId },
      select: recoverySelection,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async request(
    tenantId: string,
    requestedById: string,
    input: { targetMemberId: string; identityEvidenceReference: string; reason: string },
  ) {
    return prisma.$transaction(async (database) => {
      await this.expireStale(tenantId, database);
      await this.requireActiveAdmin(database, tenantId, requestedById);
      const target = await database.tenantMember.findFirst({
        where: { id: input.targetMemberId, tenantId, status: 'ACTIVE' },
        include: { user: { select: { id: true, status: true, totpCredential: true } } },
      });
      if (!target || target.user.status !== 'ACTIVE') {
        throw new NotFoundException('Active target member was not found');
      }
      if (target.userId === requestedById) {
        throw new ForbiddenException(
          'Administrators cannot request assisted recovery for themselves',
        );
      }
      if (!target.user.totpCredential?.verifiedAt) {
        throw new ConflictException('The target member has no verified authenticator to recover');
      }
      const settings = await database.tenantSettings.findUnique({
        where: { tenantId },
        select: { security: true },
      });
      if (!isMfaEnforced(settings?.security)) {
        throw new ConflictException('Tenant MFA must be enforced before assisted recovery is used');
      }
      const recovery = await database.mfaAssistedRecovery.create({
        data: {
          tenantId,
          targetUserId: target.userId,
          requestedById,
          requestReason: input.reason,
          identityEvidenceReference: input.identityEvidenceReference,
          expiresAt: new Date(Date.now() + REQUEST_LIFETIME_MS),
        },
        select: recoverySelection,
      });
      await database.auditLog.create({
        data: {
          action: 'CREATE',
          resource: 'mfa_assisted_recovery',
          resourceId: recovery.id,
          tenantId,
          userId: requestedById,
          metadata: {
            event: 'REQUESTED',
            targetUserId: target.userId,
            identityEvidenceReference: input.identityEvidenceReference,
            reason: input.reason,
          },
        },
      });
      return recovery;
    });
  }

  async approve(
    tenantId: string,
    recoveryId: string,
    approvedById: string,
    sessionId: string,
    reason: string,
  ) {
    const grant = randomBytes(32).toString('base64url');
    const result = await prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT "id" FROM "mfa_assisted_recoveries" WHERE "id" = ${recoveryId} FOR UPDATE`;
      const recovery = await database.mfaAssistedRecovery.findFirst({
        where: { id: recoveryId, tenantId },
      });
      if (!recovery) throw new NotFoundException('Assisted recovery request was not found');
      if (recovery.status !== 'REQUESTED') {
        throw new ConflictException('Assisted recovery request is no longer awaiting approval');
      }
      if (recovery.expiresAt <= new Date()) {
        await database.mfaAssistedRecovery.update({
          where: { id: recovery.id },
          data: { status: 'EXPIRED', grantDigest: null },
        });
        throw new GoneException('Assisted recovery request expired');
      }
      if (recovery.requestedById === approvedById || recovery.targetUserId === approvedById) {
        throw new ForbiddenException('A distinct tenant administrator must approve this recovery');
      }
      await this.requireActiveAdmin(database, tenantId, approvedById);
      const approverSession = await database.session.findFirst({
        where: {
          id: sessionId,
          userId: approvedById,
          tenantId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          mfaVerifiedAt: { not: null },
        },
      });
      if (!approverSession) {
        throw new ForbiddenException(
          'The approving administrator must complete MFA in this session',
        );
      }
      const requesterStillAdmin = await database.tenantMember.findUnique({
        where: { userId_tenantId: { userId: recovery.requestedById, tenantId } },
      });
      if (
        requesterStillAdmin?.status !== 'ACTIVE' ||
        !isTenantAdministratorRole(requesterStillAdmin.role)
      ) {
        throw new ConflictException('The requesting administrator is no longer authorized');
      }
      const now = new Date();
      const saved = await database.mfaAssistedRecovery.update({
        where: { id: recovery.id },
        data: {
          status: 'APPROVED',
          approvedById,
          approvedAt: now,
          expiresAt: new Date(now.getTime() + GRANT_LIFETIME_MS),
          grantDigest: this.digestGrant(recovery.targetUserId, grant),
        },
        select: recoverySelection,
      });
      await database.session.updateMany({
        where: { userId: recovery.targetUserId, tenantId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, mfaVerifiedAt: null },
      });
      await database.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'mfa_assisted_recovery',
          resourceId: recovery.id,
          tenantId,
          userId: approvedById,
          metadata: { event: 'APPROVED', targetUserId: recovery.targetUserId, reason },
        },
      });
      return saved;
    });
    return { ...result, grant, delivery: 'DISPLAY_ONCE' as const };
  }

  async reject(tenantId: string, recoveryId: string, rejectedById: string, reason: string) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT "id" FROM "mfa_assisted_recoveries" WHERE "id" = ${recoveryId} FOR UPDATE`;
      await this.requireActiveAdmin(database, tenantId, rejectedById);
      const recovery = await database.mfaAssistedRecovery.findFirst({
        where: { id: recoveryId, tenantId },
      });
      if (!recovery) throw new NotFoundException('Assisted recovery request was not found');
      if (recovery.status !== 'REQUESTED') {
        throw new ConflictException('Only a pending assisted recovery request can be rejected');
      }
      const now = new Date();
      const saved = await database.mfaAssistedRecovery.update({
        where: { id: recovery.id },
        data: { status: 'REJECTED', rejectedById, rejectedAt: now, grantDigest: null },
        select: recoverySelection,
      });
      await database.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'mfa_assisted_recovery',
          resourceId: recovery.id,
          tenantId,
          userId: rejectedById,
          metadata: { event: 'REJECTED', targetUserId: recovery.targetUserId, reason },
        },
      });
      return saved;
    });
  }

  async consume(userId: string, sessionId: string, grant: string) {
    const digest = this.digestGrant(userId, grant);
    return prisma.$transaction(async (database) => {
      const recovery = await database.mfaAssistedRecovery.findUnique({
        where: { grantDigest: digest },
      });
      if (!recovery) throw new UnauthorizedException('Assisted recovery grant is invalid');
      await database.$queryRaw`SELECT "id" FROM "mfa_assisted_recoveries" WHERE "id" = ${recovery.id} FOR UPDATE`;
      const current = await database.mfaAssistedRecovery.findUnique({ where: { id: recovery.id } });
      if (!current || current.status !== 'APPROVED' || current.targetUserId !== userId) {
        throw new UnauthorizedException('Assisted recovery grant is invalid');
      }
      if (current.expiresAt <= new Date()) {
        await database.mfaAssistedRecovery.update({
          where: { id: current.id },
          data: { status: 'EXPIRED', grantDigest: null },
        });
        throw new GoneException('Assisted recovery grant expired');
      }
      const session = await database.session.findFirst({
        where: {
          id: sessionId,
          userId,
          tenantId: current.tenantId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new UnauthorizedException('A fresh active tenant session is required');
      const membership = await database.tenantMember.findUnique({
        where: { userId_tenantId: { userId, tenantId: current.tenantId } },
      });
      if (membership?.status !== 'ACTIVE')
        throw new ForbiddenException('Tenant membership is inactive');

      const now = new Date();
      await database.totpCredential.deleteMany({ where: { userId } });
      await database.mfaRecoveryCode.deleteMany({ where: { userId } });
      await database.session.updateMany({
        where: { userId, id: { not: sessionId }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, mfaVerifiedAt: null },
      });
      await database.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: null } });
      await database.mfaAssistedRecovery.update({
        where: { id: current.id },
        data: { status: 'CONSUMED', consumedAt: now, grantDigest: null },
      });
      await database.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'mfa_assisted_recovery',
          resourceId: current.id,
          tenantId: current.tenantId,
          userId,
          metadata: { event: 'CONSUMED_AND_RESET', enrollmentRequired: true },
        },
      });
      return { recovered: true, enrollmentRequired: true, method: 'ASSISTED_RECOVERY' as const };
    });
  }

  private async requireActiveAdmin(
    database: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const member = await database.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (member?.status !== 'ACTIVE' || !isTenantAdministratorRole(member.role)) {
      throw new ForbiddenException('An active tenant administrator is required');
    }
  }

  private async expireStale(
    tenantId: string,
    database: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    await database.mfaAssistedRecovery.updateMany({
      where: {
        tenantId,
        status: { in: ['REQUESTED', 'APPROVED'] },
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED', grantDigest: null },
    });
  }

  private digestGrant(userId: string, grant: string): string {
    return createHash('sha256')
      .update(`gigalibs:mfa-assisted-recovery:v1:${userId}:${grant}`)
      .digest('hex');
  }
}

export function isTenantAdministratorRole(role: string): boolean {
  return role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN';
}

const recoverySelection = {
  id: true,
  status: true,
  requestReason: true,
  identityEvidenceReference: true,
  expiresAt: true,
  approvedAt: true,
  consumedAt: true,
  rejectedAt: true,
  requestedById: true,
  approvedById: true,
  rejectedById: true,
  createdAt: true,
  updatedAt: true,
  targetUser: { select: { id: true, email: true, name: true, status: true } },
} satisfies Prisma.MfaAssistedRecoverySelect;

function isMfaEnforced(security: unknown): boolean {
  return (
    !!security &&
    typeof security === 'object' &&
    (security as { enforceMfa?: unknown }).enforceMfa === true
  );
}
