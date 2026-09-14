import { createHash, randomUUID } from 'node:crypto';
import {
  createTotpUri,
  generateMfaRecoveryCode,
  generateRefreshToken,
  generateTotpSecret,
  hashMfaRecoveryCode,
  hashPassword,
  hashRefreshToken,
  matchTotpStep,
  signJwt,
  validatePasswordStrength,
  verifyPassword,
} from '@gigalibs/auth-core';
import type {
  AuthResponse,
  ChangePasswordDto,
  LoginWithEmailDto,
  RegisterWithEmailDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from '@gigalibs/contracts';
import { decrypt, encrypt, parseAes256KeyRing, requireAes256KeyVersion } from '@gigalibs/crypto';
import { prisma } from '@gigalibs/db';
import { resolveBaseRolePermissions } from '@gigalibs/rbac-nest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly accessExpirySeconds: number;
  private readonly refreshExpiryDays: number;
  private readonly mfaEncryptionKey: string;
  private readonly mfaKeyVersion: string;
  private readonly mfaDecryptionKeys: ReadonlyMap<string, string>;

  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }
    this.accessSecret = secret;
    this.accessExpirySeconds = this.parseDurationSeconds('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiryDays = this.parseDurationSeconds('JWT_REFRESH_EXPIRES_IN') / 86_400;
    this.mfaKeyVersion = this.requireEnvironmentValue('CONTROL_PAYLOAD_KEY_VERSION');
    this.mfaEncryptionKey = this.requireCanonicalEncryptionKey('CONTROL_PAYLOAD_ENCRYPTION_KEY');
    this.mfaDecryptionKeys = parseAes256KeyRing(
      this.mfaKeyVersion,
      this.mfaEncryptionKey,
      process.env.CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON,
    );
  }

  async register(dto: RegisterWithEmailDto): Promise<AuthResponse> {
    const existing = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('User with this email already exists');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    return this.createAuthSession(user.id);
  }

  async login(dto: LoginWithEmailDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = await prisma.tenantMember.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        tenant: {
          OR: [{ status: 'ACTIVE' }, { status: 'TRIAL', trialEndsAt: { gt: new Date() } }],
        },
      },
      select: { tenantId: true, role: true },
      take: 2,
    });
    const selectedMembership = memberships.length === 1 ? memberships[0] : undefined;

    return this.createAuthSession(
      user.id,
      selectedMembership?.tenantId,
      selectedMembership ? [selectedMembership.role] : [],
    );
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const session = await prisma.session.findUnique({
      where: { refreshToken: hashRefreshToken(refreshToken) },
      include: { user: true },
    });

    if (
      !session ||
      session.user.status !== 'ACTIVE' ||
      session.status !== 'ACTIVE' ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const membership = session.tenantId
      ? await prisma.tenantMember.findUnique({
          where: {
            userId_tenantId: {
              userId: session.userId,
              tenantId: session.tenantId,
            },
          },
          include: { tenant: { select: { status: true, trialEndsAt: true } } },
        })
      : null;
    const activeMembership =
      membership?.status === 'ACTIVE' &&
      (membership.tenant.status === 'ACTIVE' ||
        (membership.tenant.status === 'TRIAL' &&
          !!membership.tenant.trialEndsAt &&
          membership.tenant.trialEndsAt > new Date()))
        ? membership
        : null;

    // Rotate refresh token and clear a tenant that is no longer authorized.
    const newRefresh = generateRefreshToken(this.refreshExpiryDays);
    const rotated = await prisma.session.updateMany({
      where: {
        id: session.id,
        refreshToken: hashRefreshToken(refreshToken),
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      data: {
        refreshToken: hashRefreshToken(newRefresh.refreshToken),
        expiresAt: newRefresh.expiresAt,
        tenantId: activeMembership?.tenantId ?? null,
      },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = signJwt(
      {
        sub: session.userId,
        ...(activeMembership ? { tid: activeMembership.tenantId } : {}),
        sid: session.id,
        roles: activeMembership ? [activeMembership.role] : [],
      },
      this.accessSecret,
      this.accessExpirySeconds,
    );

    const mfa = await this.getMfaState(
      session.userId,
      activeMembership?.tenantId,
      session.mfaVerifiedAt,
    );

    return {
      accessToken,
      refreshToken: newRefresh.refreshToken,
      expiresIn: this.accessExpirySeconds,
      tokenType: 'Bearer',
      requiresMfa: mfa.required && !mfa.verified,
      mfaEnrolled: mfa.enrolled,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async selectTenant(userId: string, sessionId: string, tenantId: string): Promise<AuthResponse> {
    const [session, membership] = await Promise.all([
      prisma.session.findFirst({
        where: {
          id: sessionId,
          userId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.tenantMember.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        include: { tenant: { select: { status: true, trialEndsAt: true } } },
      }),
    ]);

    if (!session) {
      throw new UnauthorizedException('Session is invalid, expired, or revoked');
    }
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      !(
        ['ACTIVE', 'PROVISIONING'].includes(membership.tenant.status) ||
        (membership.tenant.status === 'TRIAL' &&
          !!membership.tenant.trialEndsAt &&
          membership.tenant.trialEndsAt > new Date())
      )
    ) {
      throw new ForbiddenException('You are not an active member of this tenant');
    }

    const mfa = await this.getMfaState(userId, tenantId, null);
    const refreshData = generateRefreshToken(this.refreshExpiryDays);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        tenantId,
        refreshToken: hashRefreshToken(refreshData.refreshToken),
        expiresAt: refreshData.expiresAt,
        mfaVerifiedAt: null,
      },
    });

    return this.issueTokens(
      userId,
      session.id,
      refreshData.refreshToken,
      tenantId,
      [membership.role],
      mfa,
    );
  }

  async getSessionContext(userId: string, sessionId: string, tenantId?: string) {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            totpCredential: { select: { verifiedAt: true } },
          },
        },
        tenant: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            region: true,
            plan: true,
            trialEndsAt: true,
            features: true,
            settings: { select: { security: true } },
          },
        },
      },
    });

    if (!session || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session is invalid, expired, or revoked');
    }
    if ((session.tenantId ?? undefined) !== tenantId) {
      throw new UnauthorizedException('Token tenant does not match the active session tenant');
    }

    const membership = tenantId
      ? await prisma.tenantMember.findUnique({
          where: { userId_tenantId: { userId, tenantId } },
          include: { customRole: { select: { permissions: true } } },
        })
      : null;

    if (tenantId && (!membership || membership.status !== 'ACTIVE')) {
      throw new ForbiddenException('Tenant membership is inactive or has been revoked');
    }

    const customPermissions = Array.isArray(membership?.customRole?.permissions)
      ? membership.customRole.permissions.filter(isTenantPermission)
      : [];
    const directPermissions = (membership?.permissions ?? []).filter(isTenantPermission);
    const rolePermissions = membership ? resolveBaseRolePermissions([membership.role]) : [];
    const recoveryCodesRemaining = session.user.totpCredential?.verifiedAt
      ? await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
      : 0;
    const platformRoles = (
      await prisma.platformRoleAssignment.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { role: true },
        orderBy: { createdAt: 'asc' },
      })
    ).map((assignment) => assignment.role);
    const mfaRequired = this.mfaRequiredFromSecurity(
      session.tenant?.settings?.security,
      !!tenantId,
    );
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        status: session.user.status,
      },
      tenant: session.tenant
        ? {
            id: session.tenant.id,
            slug: session.tenant.slug,
            name: session.tenant.name,
            status: session.tenant.status,
            region: session.tenant.region,
            plan: session.tenant.plan,
            trialEndsAt: session.tenant.trialEndsAt,
            features: session.tenant.features,
          }
        : null,
      roles: membership ? [membership.role] : [],
      platformRoles,
      permissions: Array.from(
        new Set([...rolePermissions, ...directPermissions, ...customPermissions]),
      ),
      session: { id: session.id, expiresAt: session.expiresAt },
      mfa: {
        required: mfaRequired,
        enrolled: !!session.user.totpCredential?.verifiedAt,
        verified: !mfaRequired || !!session.mfaVerifiedAt,
        recoveryCodesRemaining,
      },
    };
  }

  async startTotpEnrollment(userId: string, sessionId: string) {
    const now = new Date();
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE', expiresAt: { gt: now } },
      include: {
        user: { select: { email: true, status: true } },
        tenant: { select: { id: true, name: true, settings: { select: { security: true } } } },
      },
    });
    if (!session || session.user.status !== 'ACTIVE' || !session.tenant) {
      throw new UnauthorizedException('An active tenant session is required');
    }
    if (!this.mfaRequiredFromSecurity(session.tenant.settings?.security, true)) {
      throw new ConflictException('This tenant does not require MFA enrollment');
    }
    if (session.createdAt.getTime() < now.getTime() - 10 * 60 * 1_000) {
      throw new ForbiddenException({
        code: 'FRESH_LOGIN_REQUIRED',
        message: 'Sign in again before enrolling an authenticator.',
      });
    }
    const tenant = session.tenant;
    const accountEmail = session.user.email;

    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const current = await transaction.totpCredential.findUnique({ where: { userId } });
      if (current?.verifiedAt) {
        throw new ConflictException('A verified authenticator is already enrolled');
      }
      const credentialId = current?.id ?? randomUUID();
      const secret = generateTotpSecret();
      const secretEnvelope = await encrypt(
        secret,
        this.mfaEncryptionKey,
        this.mfaAuthenticatedContext(credentialId, userId),
      );
      const credential = current
        ? await transaction.totpCredential.update({
            where: { id: current.id },
            data: {
              secretEnvelope,
              keyVersion: this.mfaKeyVersion,
              failedAttempts: 0,
              lockedUntil: null,
              lastUsedStep: null,
            },
          })
        : await transaction.totpCredential.create({
            data: {
              id: credentialId,
              userId,
              secretEnvelope,
              keyVersion: this.mfaKeyVersion,
            },
          });
      await transaction.auditLog.create({
        data: {
          action: current ? 'UPDATE' : 'CREATE',
          resource: 'mfa_totp_credential',
          resourceId: credential.id,
          userId,
          tenantId: tenant.id,
          metadata: { event: 'ENROLLMENT_STARTED', keyVersion: this.mfaKeyVersion },
        },
      });
      return {
        method: 'TOTP' as const,
        secret,
        uri: createTotpUri(secret, tenant.name, accountEmail),
      };
    });
  }

  async verifyTotp(userId: string, sessionId: string, code: string) {
    const outcome = await prisma.$transaction(async (transaction) => {
      const session = await transaction.session.findFirst({
        where: { id: sessionId, userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        include: {
          user: { select: { status: true } },
          tenant: { select: { id: true, settings: { select: { security: true } } } },
        },
      });
      if (!session || session.user.status !== 'ACTIVE' || !session.tenant) {
        throw new UnauthorizedException('An active tenant session is required');
      }
      if (!this.mfaRequiredFromSecurity(session.tenant.settings?.security, true)) {
        throw new ConflictException('This tenant does not require MFA verification');
      }
      await transaction.$queryRaw`SELECT "id" FROM "totp_credentials" WHERE "userId" = ${userId} FOR UPDATE`;
      const credential = await transaction.totpCredential.findUnique({ where: { userId } });
      if (!credential) throw new ConflictException('Enroll an authenticator before verification');
      const now = new Date();
      if (credential.lockedUntil && credential.lockedUntil > now) {
        return { ok: false as const, locked: true, retryAt: credential.lockedUntil };
      }
      const secret = await decrypt(
        credential.secretEnvelope,
        this.requireMfaDecryptionKey(credential.keyVersion),
        this.mfaAuthenticatedContext(credential.id, userId),
      );
      const matchedStep = matchTotpStep(code, secret);
      const replayed =
        matchedStep !== null &&
        credential.lastUsedStep !== null &&
        matchedStep <= credential.lastUsedStep;
      if (matchedStep === null || replayed) {
        const failedAttempts =
          credential.lockedUntil && credential.lockedUntil <= now
            ? 1
            : credential.failedAttempts + 1;
        const lockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1_000) : null;
        await transaction.totpCredential.update({
          where: { id: credential.id },
          data: { failedAttempts, lockedUntil },
        });
        await transaction.auditLog.create({
          data: {
            action: 'LOGIN',
            resource: 'mfa_totp_credential',
            resourceId: credential.id,
            userId,
            tenantId: session.tenant.id,
            metadata: {
              event: replayed ? 'REPLAY_REJECTED' : 'VERIFICATION_FAILED',
              failedAttempts,
              locked: !!lockedUntil,
            },
          },
        });
        return { ok: false as const, locked: !!lockedUntil, retryAt: lockedUntil };
      }

      const rotatedEnvelope =
        credential.keyVersion === this.mfaKeyVersion
          ? credential.secretEnvelope
          : await encrypt(
              secret,
              this.mfaEncryptionKey,
              this.mfaAuthenticatedContext(credential.id, userId),
            );
      await transaction.totpCredential.update({
        where: { id: credential.id },
        data: {
          secretEnvelope: rotatedEnvelope,
          keyVersion: this.mfaKeyVersion,
          verifiedAt: credential.verifiedAt ?? now,
          lastUsedStep: matchedStep,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.session.update({
        where: { id: session.id },
        data: { mfaVerifiedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          action: 'LOGIN',
          resource: 'mfa_totp_credential',
          resourceId: credential.id,
          userId,
          tenantId: session.tenant.id,
          metadata: {
            event: credential.verifiedAt ? 'VERIFIED' : 'ENROLLMENT_COMPLETED',
            keyRotated: credential.keyVersion !== this.mfaKeyVersion,
            keyVersion: this.mfaKeyVersion,
          },
        },
      });
      return { ok: true as const };
    });

    if (!outcome.ok) {
      if (outcome.locked) {
        throw new HttpException(
          {
            code: 'MFA_LOCKED',
            message: 'Too many failed MFA attempts. Try again after the lock expires.',
            retryAt: outcome.retryAt,
          },
          429,
        );
      }
      throw new UnauthorizedException('Invalid or previously used MFA code');
    }
    return { authenticated: true, method: 'TOTP' as const, verified: true };
  }

  async generateRecoveryCodes(userId: string, sessionId: string, reason: string) {
    const codes = Array.from({ length: 10 }, () => generateMfaRecoveryCode());
    const records = codes.map((code) => {
      const codeDigest = hashMfaRecoveryCode(code, userId);
      if (!codeDigest) throw new Error('Generated MFA recovery code could not be normalized.');
      return { codeDigest, userId };
    });

    const replacedCount = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const session = await transaction.session.findFirst({
        where: { id: sessionId, userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        include: {
          user: { select: { status: true, totpCredential: { select: { verifiedAt: true } } } },
          tenant: {
            select: {
              id: true,
              status: true,
              trialEndsAt: true,
              settings: { select: { security: true } },
            },
          },
        },
      });
      if (
        !session ||
        session.user.status !== 'ACTIVE' ||
        !session.tenant ||
        !this.isOperationalTenant(session.tenant)
      ) {
        throw new UnauthorizedException('An active tenant session is required');
      }
      if (!this.mfaRequiredFromSecurity(session.tenant.settings?.security, true)) {
        throw new ConflictException('This tenant does not require MFA recovery credentials');
      }
      if (!session.user.totpCredential?.verifiedAt || !session.mfaVerifiedAt) {
        throw new ForbiddenException({
          code: 'MFA_REQUIRED',
          message: 'Verify the enrolled authenticator before generating recovery codes.',
        });
      }

      const existing = await transaction.mfaRecoveryCode.count({ where: { userId } });
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
      await transaction.mfaRecoveryCode.createMany({ data: records });
      await transaction.auditLog.create({
        data: {
          action: existing ? 'UPDATE' : 'CREATE',
          resource: 'mfa_recovery_codes',
          userId,
          tenantId: session.tenant.id,
          metadata: {
            event: existing ? 'ROTATED' : 'GENERATED',
            count: records.length,
            replacedCount: existing,
            reason,
          },
        },
      });
      return existing;
    });

    return {
      codes,
      count: codes.length,
      replacedExisting: replacedCount > 0,
      delivery: 'DISPLAY_ONCE' as const,
    };
  }

  async verifyRecoveryCode(userId: string, sessionId: string, code: string) {
    const codeDigest = hashMfaRecoveryCode(code, userId);
    if (!codeDigest)
      throw new UnauthorizedException('Invalid or previously used MFA recovery code');

    const outcome = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "totp_credentials" WHERE "userId" = ${userId} FOR UPDATE`;
      const session = await transaction.session.findFirst({
        where: { id: sessionId, userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        include: {
          user: { select: { status: true } },
          tenant: {
            select: {
              id: true,
              status: true,
              trialEndsAt: true,
              settings: { select: { security: true } },
            },
          },
        },
      });
      if (
        !session ||
        session.user.status !== 'ACTIVE' ||
        !session.tenant ||
        !this.isOperationalTenant(session.tenant)
      ) {
        throw new UnauthorizedException('An active tenant session is required');
      }
      if (!this.mfaRequiredFromSecurity(session.tenant.settings?.security, true)) {
        throw new ConflictException('This tenant does not require MFA verification');
      }
      const credential = await transaction.totpCredential.findUnique({ where: { userId } });
      if (!credential?.verifiedAt) {
        throw new ConflictException('Enroll an authenticator before using recovery credentials');
      }
      const now = new Date();
      if (credential.lockedUntil && credential.lockedUntil > now) {
        return { ok: false as const, locked: true, retryAt: credential.lockedUntil };
      }

      const recoveryCode = await transaction.mfaRecoveryCode.findUnique({
        where: { userId_codeDigest: { userId, codeDigest } },
      });
      if (!recoveryCode || recoveryCode.usedAt) {
        const failedAttempts =
          credential.lockedUntil && credential.lockedUntil <= now
            ? 1
            : credential.failedAttempts + 1;
        const lockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1_000) : null;
        await transaction.totpCredential.update({
          where: { id: credential.id },
          data: { failedAttempts, lockedUntil },
        });
        await transaction.auditLog.create({
          data: {
            action: 'LOGIN',
            resource: 'mfa_recovery_codes',
            userId,
            tenantId: session.tenant.id,
            metadata: { event: 'VERIFICATION_FAILED', failedAttempts, locked: !!lockedUntil },
          },
        });
        return { ok: false as const, locked: !!lockedUntil, retryAt: lockedUntil };
      }

      const consumed = await transaction.mfaRecoveryCode.updateMany({
        where: { id: recoveryCode.id, userId, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        return { ok: false as const, locked: false, retryAt: null };
      }
      await transaction.totpCredential.update({
        where: { id: credential.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
      await transaction.session.update({
        where: { id: session.id },
        data: { mfaVerifiedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          action: 'LOGIN',
          resource: 'mfa_recovery_codes',
          resourceId: recoveryCode.id,
          userId,
          tenantId: session.tenant.id,
          metadata: { event: 'VERIFIED_AND_CONSUMED' },
        },
      });
      const remaining = await transaction.mfaRecoveryCode.count({
        where: { userId, usedAt: null },
      });
      return { ok: true as const, remaining };
    });

    if (!outcome.ok) {
      if (outcome.locked) {
        throw new HttpException(
          {
            code: 'MFA_LOCKED',
            message: 'Too many failed MFA attempts. Try again after the lock expires.',
            retryAt: outcome.retryAt,
          },
          429,
        );
      }
      throw new UnauthorizedException('Invalid or previously used MFA recovery code');
    }
    return {
      authenticated: true,
      method: 'RECOVERY_CODE' as const,
      verified: true,
      recoveryCodesRemaining: outcome.remaining,
    };
  }

  async createSessionForIdentity(
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<AuthResponse> {
    return this.createAuthSession(userId, tenantId, [role]);
  }

  private async createAuthSession(
    userId: string,
    tenantId?: string,
    roles: string[] = [],
  ): Promise<AuthResponse> {
    const refreshData = generateRefreshToken(this.refreshExpiryDays);

    const session = await prisma.session.create({
      data: {
        userId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        refreshToken: hashRefreshToken(refreshData.refreshToken),
        expiresAt: refreshData.expiresAt,
        status: 'ACTIVE',
      },
    });

    const mfa = await this.getMfaState(userId, tenantId, session.mfaVerifiedAt);

    return this.issueTokens(userId, session.id, refreshData.refreshToken, tenantId, roles, mfa);
  }

  private issueTokens(
    userId: string,
    sessionId: string,
    refreshToken: string,
    tenantId?: string,
    roles: string[] = [],
    mfa: MfaState = { required: false, enrolled: false, verified: true },
  ): AuthResponse {
    const accessToken = signJwt(
      {
        sub: userId,
        ...(tenantId !== undefined ? { tid: tenantId } : {}),
        sid: sessionId,
        roles,
      },
      this.accessSecret,
      this.accessExpirySeconds,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpirySeconds,
      tokenType: 'Bearer',
      requiresMfa: mfa.required && !mfa.verified,
      mfaEnrolled: mfa.enrolled,
    };
  }

  private async getMfaState(
    userId: string,
    tenantId: string | undefined,
    mfaVerifiedAt: Date | null,
  ): Promise<MfaState> {
    if (!tenantId) return { required: false, enrolled: false, verified: true };
    const [settings, credential] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { tenantId }, select: { security: true } }),
      prisma.totpCredential.findUnique({ where: { userId }, select: { verifiedAt: true } }),
    ]);
    const required = this.mfaRequiredFromSecurity(settings?.security, true);
    return {
      required,
      enrolled: !!credential?.verifiedAt,
      verified: !required || !!mfaVerifiedAt,
    };
  }

  private mfaRequiredFromSecurity(security: unknown, tenantSelected: boolean): boolean {
    if (!tenantSelected) return false;
    if (!isRecord(security) || typeof security.enforceMfa !== 'boolean') {
      throw new ForbiddenException({
        code: 'MFA_POLICY_UNAVAILABLE',
        message: 'Tenant MFA policy could not be verified.',
      });
    }
    return security.enforceMfa;
  }

  private isOperationalTenant(tenant: { status: string; trialEndsAt: Date | null }): boolean {
    return (
      tenant.status === 'ACTIVE' ||
      (tenant.status === 'TRIAL' && !!tenant.trialEndsAt && tenant.trialEndsAt > new Date())
    );
  }

  private mfaAuthenticatedContext(credentialId: string, userId: string): string {
    return `gigalibs:mfa-totp:v1:${credentialId}:${userId}`;
  }

  private requireCanonicalEncryptionKey(name: string): string {
    const value = this.requireEnvironmentValue(name);
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== value) {
      throw new Error(`${name} must be a canonical base64-encoded 32-byte key.`);
    }
    return value;
  }

  private requireEnvironmentValue(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} must be configured.`);
    return value;
  }

  private parseDurationSeconds(name: string): number {
    const rawValue = process.env[name];
    const match = rawValue?.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      throw new Error(`${name} must use a positive duration such as 900s, 15m, 24h, or 30d.`);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3_600 : 86_400;
    const seconds = amount * multiplier;
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
      throw new Error(`${name} exceeds the supported duration range.`);
    }
    return seconds;
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            role: true,
            status: true,
            tenant: {
              select: { id: true, name: true, slug: true, status: true, plan: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const platformRoles = (
      await prisma.platformRoleAssignment.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { role: true, reason: true, createdAt: true },
      })
    );
    return {
      ...user,
      platformRoles,
    };
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const previous = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, phone: true, updatedAt: true },
    });
    if (!previous) throw new NotFoundException('User not found');

    const next = {
      name: data.name ?? previous.name,
      phone: data.phone !== undefined ? data.phone : previous.phone,
    };
    try {
      return await prisma.$transaction(async (transaction) => {
        const updated = await transaction.user.updateMany({
          where: { id: userId, updatedAt: new Date(data.expectedUpdatedAt) },
          data: {
            name: next.name,
            phone: next.phone,
            ...(next.phone !== previous.phone ? { phoneVerifiedAt: null } : {}),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Profile changed since it was loaded. Reload and try again.');
        }
        const user = await transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            avatarUrl: true,
            status: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            updatedAt: true,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'UPDATE',
            resource: 'user_profile',
            resourceId: userId,
            userId,
            before: { name: previous.name, phone: previous.phone },
            after: { name: user.name, phone: user.phone },
          },
        });
        return user;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('That phone number is already assigned to another account.');
      }
      throw error;
    }
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      throw new ConflictException('This account does not have a local password credential.');
    }
    const isValid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');
    if (await verifyPassword(dto.newPassword, user.passwordHash)) {
      throw new ConflictException('The new password must be different from the current password.');
    }
    const validation = validatePasswordStrength(dto.newPassword);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join('; '));
    }
    const newHash = await hashPassword(dto.newPassword);
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash },
        data: { passwordHash: newHash },
      });
      if (updated.count !== 1) {
        throw new ConflictException('The password changed during this request. Sign in again.');
      }
      await transaction.session.updateMany({
        where: { userId, id: { not: sessionId }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'user_password',
          resourceId: userId,
          userId,
          metadata: { event: 'SELF_SERVICE_CHANGE', otherSessionsRevoked: true },
        },
      });
    });
    return { success: true, otherSessionsRevoked: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const validation = validatePasswordStrength(dto.password);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join('; '));
    }
    const newHash = await hashPassword(dto.password);
    const digest = createHash('sha256').update(dto.token, 'utf8').digest('hex');
    const outcome = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "password_reset_credentials" WHERE "tokenDigest" = ${digest} FOR UPDATE`;
      const credential = await transaction.passwordResetCredential.findUnique({
        where: { tokenDigest: digest },
        include: { user: { select: { status: true } } },
      });
      if (
        !credential ||
        credential.usedAt ||
        credential.expiresAt <= new Date() ||
        credential.user.status === 'DEACTIVATED'
      ) {
        return null;
      }
      const usedAt = new Date();
      const consumed = await transaction.passwordResetCredential.updateMany({
        where: { id: credential.id, usedAt: null, expiresAt: { gt: usedAt } },
        data: { usedAt },
      });
      if (consumed.count !== 1) return null;
      await transaction.user.update({
        where: { id: credential.userId },
        data: { passwordHash: newHash },
      });
      await transaction.session.updateMany({
        where: { userId: credential.userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: usedAt },
      });
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'user_password',
          resourceId: credential.userId,
          userId: credential.userId,
          metadata: {
            event: 'ASSISTED_RESET_CONSUMED',
            credentialId: credential.id,
            requestedById: credential.requestedById,
            sessionsRevoked: true,
          },
        },
      });
      return credential.userId;
    });
    if (!outcome) throw new UnauthorizedException('Password reset credential is invalid or expired');
    return { success: true, sessionsRevoked: true };
  }

  private requireMfaDecryptionKey(version: string): string {
    try {
      return requireAes256KeyVersion(this.mfaDecryptionKeys, version);
    } catch {
      throw new ConflictException('The authenticator encryption key version is unavailable');
    }
  }
}

interface MfaState {
  required: boolean;
  enrolled: boolean;
  verified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTenantPermission(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z][a-z0-9-]*:(?:\*|[a-z][a-z0-9-]*)$/.test(value) &&
    !value.startsWith('platform:')
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}
