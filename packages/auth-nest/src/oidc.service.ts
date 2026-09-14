import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { verifyPassword } from '@gigalibs/auth-core';
import type {
  CompleteOidcAuthorizationResponse,
  CompleteOidcLoginDto,
  RevokeExternalIdentityDto,
  UpsertTenantOidcConfigurationDto,
} from '@gigalibs/contracts';
import { decrypt, encrypt, parseAes256KeyRing, requireAes256KeyVersion } from '@gigalibs/crypto';
import { prisma } from '@gigalibs/db';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as oidc from 'openid-client';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { AuthService } from './auth.service.js';
import { isForbiddenOidcAddress, isLoopbackOidcAddress } from './oidc-network-policy.js';

const FLOW_LIFETIME_MS = 10 * 60 * 1_000;
const PROVIDER_TIMEOUT_SECONDS = 5;

@Injectable()
export class OidcService {
  private readonly encryptionKey: string;
  private readonly keyVersion: string;
  private readonly decryptionKeys: ReadonlyMap<string, string>;
  private readonly allowTestLoopback: boolean;

  constructor(private readonly authService: AuthService) {
    this.encryptionKey = this.requireCanonicalEncryptionKey('CONTROL_PAYLOAD_ENCRYPTION_KEY');
    this.keyVersion = this.requireEnvironmentValue('CONTROL_PAYLOAD_KEY_VERSION');
    this.decryptionKeys = parseAes256KeyRing(
      this.keyVersion,
      this.encryptionKey,
      process.env.CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON,
    );
    this.allowTestLoopback =
      process.env.NODE_ENV === 'test' && process.env.OIDC_ALLOW_TEST_LOOPBACK === 'true';
  }

  async getConfiguration(tenantId: string) {
    const configuration = await prisma.tenantOidcConfiguration.findUnique({
      where: { tenantId },
      select: {
        issuer: true,
        clientId: true,
        scopes: true,
        enabled: true,
        allowJitProvisioning: true,
        defaultRole: true,
        updatedAt: true,
      },
    });
    return configuration ? { ...configuration, hasClientSecret: true } : null;
  }

  async upsertConfiguration(
    tenantId: string,
    userId: string,
    dto: UpsertTenantOidcConfigurationDto,
  ) {
    const issuer = this.normalizeIssuer(dto.issuer);
    const [tenant, existing] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          customDomain: true,
          customDomainVerifiedAt: true,
          customDomainChallengeExpiresAt: true,
        },
      }),
      prisma.tenantOidcConfiguration.findUnique({ where: { tenantId } }),
    ]);
    if (!tenant) throw new BadRequestException('Tenant does not exist');
    if (!existing && !dto.clientSecret) {
      throw new BadRequestException('A client secret is required for initial OIDC configuration');
    }
    if ((existing?.updatedAt.toISOString() ?? null) !== dto.expectedUpdatedAt) {
      throw new ConflictException('OIDC configuration changed after it was loaded');
    }
    if (dto.enabled && (!tenant.customDomain || !tenant.customDomainVerifiedAt)) {
      throw new ConflictException('Verify the tenant email domain before enabling OIDC');
    }

    // Enabling is accepted only after live discovery succeeds through the outbound network policy.
    if (dto.enabled) {
      const secretForDiscovery =
        dto.clientSecret ??
        (existing ? await this.decryptConfigurationSecret(existing) : undefined);
      if (!secretForDiscovery) throw new BadRequestException('OIDC client secret is unavailable');
      await this.discover(issuer, dto.clientId, secretForDiscovery);
    }

    const id = existing?.id ?? randomUUID();
    const secretForStorage =
      dto.clientSecret ?? (existing ? await this.decryptConfigurationSecret(existing) : undefined);
    const secretEnvelope = secretForStorage
      ? await encrypt(secretForStorage, this.encryptionKey, this.configurationContext(id, tenantId))
      : undefined;
    if (!secretEnvelope) throw new BadRequestException('OIDC client secret is unavailable');
    const storedKeyVersion = this.keyVersion;

    let trustChanged = false;
    let identityTrustChanged = false;
    const saved = await prisma.$transaction(async (transaction) => {
      if (existing) {
        await transaction.$queryRaw`SELECT "id" FROM "tenant_oidc_configurations" WHERE "id" = ${existing.id} FOR UPDATE`;
      }
      const current = await transaction.tenantOidcConfiguration.findUnique({ where: { tenantId } });
      if ((current?.updatedAt.toISOString() ?? null) !== dto.expectedUpdatedAt) {
        throw new ConflictException('OIDC configuration changed after it was loaded');
      }
      trustChanged =
        !!current &&
        (current.issuer !== issuer ||
          current.clientId !== dto.clientId ||
          dto.clientSecret !== undefined ||
          (current.enabled && !dto.enabled) ||
          current.scopes.join(' ') !== dto.scopes.join(' '));
      identityTrustChanged =
        !!current && (current.issuer !== issuer || current.clientId !== dto.clientId);
      const configuration = current
        ? await transaction.tenantOidcConfiguration.update({
            where: { id: current.id },
            data: {
              issuer,
              clientId: dto.clientId,
              clientSecretEnvelope: secretEnvelope,
              keyVersion: storedKeyVersion,
              scopes: dto.scopes,
              enabled: dto.enabled,
              allowJitProvisioning: dto.allowJitProvisioning,
              defaultRole: dto.defaultRole,
              configuredById: userId,
            },
          })
        : await transaction.tenantOidcConfiguration.create({
            data: {
              id,
              tenantId,
              issuer,
              clientId: dto.clientId,
              clientSecretEnvelope: secretEnvelope,
              keyVersion: this.keyVersion,
              scopes: dto.scopes,
              enabled: dto.enabled,
              allowJitProvisioning: dto.allowJitProvisioning,
              defaultRole: dto.defaultRole,
              configuredById: userId,
            },
          });
      if (trustChanged) {
        const revokedAt = new Date();
        await transaction.session.updateMany({
          where: { tenantId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt },
        });
        await transaction.oidcLoginTransaction.deleteMany({ where: { tenantId } });
        if (identityTrustChanged) {
          await transaction.externalIdentity.updateMany({
            where: { configurationId: configuration.id, status: 'ACTIVE' },
            data: {
              status: 'REVOKED',
              revokedAt,
              statusReason: 'OIDC issuer or client identifier changed',
            },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          action: current ? 'UPDATE' : 'CREATE',
          resource: 'tenant_oidc_configuration',
          resourceId: configuration.id,
          tenantId,
          userId,
          metadata: {
            event: current ? 'CONFIGURATION_UPDATED' : 'CONFIGURATION_CREATED',
            enabled: dto.enabled,
            allowJitProvisioning: dto.allowJitProvisioning,
            defaultRole: dto.defaultRole,
            scopes: dto.scopes,
            trustChanged,
            externalIdentitiesRevoked: identityTrustChanged,
            reason: dto.reason,
          },
        },
      });
      return configuration;
    });
    return {
      issuer: saved.issuer,
      clientId: saved.clientId,
      scopes: saved.scopes,
      enabled: saved.enabled,
      allowJitProvisioning: saved.allowJitProvisioning,
      defaultRole: saved.defaultRole,
      updatedAt: saved.updatedAt,
      hasClientSecret: true,
      sessionsRevoked: trustChanged,
    };
  }

  async deleteConfiguration(tenantId: string, userId: string, reason: string) {
    const existing = await prisma.tenantOidcConfiguration.findUnique({ where: { tenantId } });
    if (!existing) return { deleted: false, sessionsRevoked: false };
    await prisma.$transaction(async (transaction) => {
      await transaction.tenantOidcConfiguration.delete({ where: { id: existing.id } });
      await transaction.session.updateMany({
        where: { tenantId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          action: 'DELETE',
          resource: 'tenant_oidc_configuration',
          resourceId: existing.id,
          tenantId,
          userId,
          metadata: { event: 'CONFIGURATION_DELETED', reason, sessionsRevoked: true },
        },
      });
    });
    return { deleted: true, sessionsRevoked: true };
  }

  async startLogin(tenantSlug: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { oidcConfiguration: true },
    });
    const configuration = tenant?.oidcConfiguration;
    if (
      !tenant ||
      !this.isOperationalTenant(tenant) ||
      !tenant.customDomain ||
      !tenant.customDomainVerifiedAt ||
      !configuration?.enabled
    ) {
      throw new UnauthorizedException('SSO is unavailable for this workspace');
    }
    return this.startAuthorization(tenant, configuration, {
      purpose: 'LOGIN',
      linkUserId: null,
      linkReason: null,
    });
  }

  async startLink(tenantId: string, userId: string, reason: string) {
    const [tenant, user] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { oidcConfiguration: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          status: true,
          emailVerifiedAt: true,
          memberships: {
            where: { tenantId },
            select: { status: true },
          },
        },
      }),
    ]);
    const configuration = tenant?.oidcConfiguration;
    if (
      !tenant ||
      !this.isOperationalTenant(tenant) ||
      !tenant.customDomain ||
      !tenant.customDomainVerifiedAt ||
      !configuration?.enabled
    ) {
      throw new ConflictException('External identity linking is unavailable for this workspace');
    }
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.emailVerifiedAt ||
      user.memberships[0]?.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException('The current user is not eligible to link this workspace identity');
    }
    return this.startAuthorization(tenant, configuration, {
      purpose: 'LINK',
      linkUserId: userId,
      linkReason: reason,
    });
  }

  async listExternalIdentities(tenantId: string, userId: string) {
    const [user, configuration] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      }),
      prisma.tenantOidcConfiguration.findUnique({
        where: { tenantId },
        select: { enabled: true, issuer: true },
      }),
    ]);
    if (!user) throw new ForbiddenException('The current user is unavailable');
    const identities = configuration
      ? await prisma.externalIdentity.findMany({
          where: { userId, issuer: configuration.issuer },
          orderBy: [{ status: 'asc' }, { lastLoginAt: 'desc' }],
          select: {
            id: true,
            issuer: true,
            status: true,
            statusReason: true,
            lastLoginAt: true,
            revokedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];
    return {
      provider: configuration
        ? { issuer: configuration.issuer, enabled: configuration.enabled }
        : null,
      localPasswordConfigured: Boolean(user.passwordHash),
      identities,
    };
  }

  async revokeExternalIdentity(
    tenantId: string,
    userId: string,
    sessionId: string,
    identityId: string,
    dto: RevokeExternalIdentityDto,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is required to disconnect external sign-in');
    }
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const configuration = await database.tenantOidcConfiguration.findUnique({
        where: { tenantId },
        select: { issuer: true },
      });
      if (!configuration) {
        throw new ConflictException('This workspace has no external identity provider configuration');
      }
      const identity = await database.externalIdentity.findFirst({
        where: { id: identityId, userId, issuer: configuration.issuer },
      });
      if (!identity) throw new BadRequestException('External identity binding does not exist');
      if (identity.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
        throw new ConflictException('External identity changed since it was loaded. Reload and try again.');
      }
      if (identity.status !== 'ACTIVE') {
        throw new ConflictException('External identity is already disconnected');
      }
      const changedAt = new Date();
      const updated = await database.externalIdentity.update({
        where: { id: identity.id },
        data: { status: 'REVOKED', statusReason: dto.reason, revokedAt: changedAt },
      });
      const sessions = await database.session.updateMany({
        where: { userId, id: { not: sessionId }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: changedAt },
      });
      await database.auditLog.create({
        data: {
          action: 'STATUS_CHANGE',
          resource: 'external_identity',
          resourceId: identity.id,
          tenantId,
          userId,
          before: { status: identity.status, revokedAt: identity.revokedAt },
          after: { status: updated.status, revokedAt: updated.revokedAt },
          metadata: {
            event: 'SELF_SERVICE_BINDING_REVOKED',
            reason: dto.reason,
            issuer: identity.issuer,
            otherSessionsRevoked: sessions.count,
          },
        },
      });
      return {
        id: updated.id,
        issuer: updated.issuer,
        status: updated.status,
        statusReason: updated.statusReason,
        revokedAt: updated.revokedAt,
        updatedAt: updated.updatedAt,
        otherSessionsRevoked: sessions.count,
      };
    });
  }

  private async startAuthorization(
    tenant: { id: string },
    configuration: {
      id: string;
      tenantId: string;
      issuer: string;
      clientId: string;
      clientSecretEnvelope: string;
      keyVersion: string;
      scopes: string[];
    },
    intent: {
      purpose: 'LOGIN' | 'LINK';
      linkUserId: string | null;
      linkReason: string | null;
    },
  ) {
    const clientSecret = await this.decryptConfigurationSecret(configuration);
    const provider = await this.discover(
      configuration.issuer,
      configuration.clientId,
      clientSecret,
    );
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const transactionId = randomUUID();
    const verifierEnvelope = await encrypt(
      verifier,
      this.encryptionKey,
      this.flowContext(transactionId, tenant.id),
    );
    await prisma.$transaction([
      prisma.oidcLoginTransaction.deleteMany({
        where: { tenantId: tenant.id, expiresAt: { lte: new Date() } },
      }),
      prisma.oidcLoginTransaction.create({
        data: {
          id: transactionId,
          tenantId: tenant.id,
          configurationId: configuration.id,
          stateDigest: this.digestState(state),
          nonce,
          codeVerifierEnvelope: verifierEnvelope,
          keyVersion: this.keyVersion,
          purpose: intent.purpose,
          linkUserId: intent.linkUserId,
          linkReason: intent.linkReason,
          expiresAt: new Date(Date.now() + FLOW_LIFETIME_MS),
        },
      }),
      prisma.auditLog.create({
        data: {
          action: intent.purpose === 'LOGIN' ? 'LOGIN' : 'UPDATE',
          resource: intent.purpose === 'LOGIN' ? 'oidc_login' : 'external_identity_link',
          resourceId: intent.linkUserId,
          tenantId: tenant.id,
          userId: intent.linkUserId,
          metadata: {
            event:
              intent.purpose === 'LOGIN'
                ? 'AUTHORIZATION_STARTED'
                : 'ACCOUNT_LINK_AUTHORIZATION_STARTED',
            ...(intent.linkReason ? { reason: intent.linkReason } : {}),
          },
        },
      }),
    ]);
    const authorizationUrl = oidc.buildAuthorizationUrl(provider, {
      redirect_uri: this.requireRedirectUri().toString(),
      scope: configuration.scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    await this.assertSafeProviderUrl(authorizationUrl);
    return { authorizationUrl: authorizationUrl.toString(), expiresIn: FLOW_LIFETIME_MS / 1_000 };
  }

  async completeLogin(dto: CompleteOidcLoginDto): Promise<CompleteOidcAuthorizationResponse> {
    if (dto.error) {
      if (dto.state) await this.consumeRejectedProviderState(dto.state, dto.error);
      throw new UnauthorizedException('The identity provider rejected sign-in');
    }
    if (!dto.code || !dto.state) throw new UnauthorizedException('Invalid OIDC callback');
    const transaction = await this.consumeTransaction(dto.state);
    const verifier = await decrypt(
      transaction.codeVerifierEnvelope,
      this.requireDecryptionKey(
        transaction.keyVersion,
        'The sign-in transaction key is unavailable',
      ),
      this.flowContext(transaction.id, transaction.tenantId),
    );
    const clientSecret = await this.decryptConfigurationSecret(transaction.configuration);
    let claims: Record<string, unknown> | undefined;
    try {
      const provider = await this.discover(
        transaction.configuration.issuer,
        transaction.configuration.clientId,
        clientSecret,
      );
      const callback = new URL(this.requireRedirectUri());
      callback.searchParams.set('code', dto.code);
      callback.searchParams.set('state', dto.state);
      const tokens = await oidc.authorizationCodeGrant(provider, callback, {
        pkceCodeVerifier: verifier,
        expectedState: dto.state,
        expectedNonce: transaction.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims() as Record<string, unknown> | undefined;
    } catch (error) {
      await this.auditCallbackFailure(
        transaction.tenantId,
        'TOKEN_VALIDATION_FAILED',
        error,
        transaction.linkUserId ?? undefined,
      );
      throw new UnauthorizedException('Identity verification failed. Start a new sign-in.');
    }
    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      typeof claims.iss !== 'string' ||
      typeof claims.email !== 'string' ||
      claims.email_verified !== true
    ) {
      await this.auditCallbackFailure(
        transaction.tenantId,
        'REQUIRED_CLAIMS_MISSING',
        undefined,
        transaction.linkUserId ?? undefined,
      );
      throw new UnauthorizedException('The identity provider did not supply a verified email');
    }
    const issuer = this.normalizeIssuer(claims.iss);
    if (issuer !== transaction.configuration.issuer) {
      await this.auditCallbackFailure(
        transaction.tenantId,
        'ISSUER_MISMATCH',
        undefined,
        transaction.linkUserId ?? undefined,
      );
      throw new UnauthorizedException('Identity issuer does not match the tenant configuration');
    }
    const email = claims.email.trim().toLowerCase();
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      await this.auditCallbackFailure(
        transaction.tenantId,
        'EMAIL_CLAIM_INVALID',
        undefined,
        transaction.linkUserId ?? undefined,
      );
      throw new UnauthorizedException('The identity provider supplied an invalid email');
    }
    if (transaction.purpose === 'LINK') {
      try {
        return await this.completeLink(transaction, issuer, claims.sub, email);
      } catch (error) {
        await this.auditCallbackFailure(
          transaction.tenantId,
          'ACCOUNT_LINK_REJECTED',
          error,
          transaction.linkUserId ?? undefined,
        );
        throw error;
      }
    }
    let identity: { userId: string; role: string };
    try {
      identity = await this.resolveIdentity(transaction, issuer, claims.sub, email, claims.name);
    } catch (error) {
      await this.auditCallbackFailure(
        transaction.tenantId,
        'IDENTITY_MAPPING_REJECTED',
        error,
        transaction.linkUserId ?? undefined,
      );
      throw error;
    }
    return this.authService.createSessionForIdentity(
      identity.userId,
      transaction.tenantId,
      identity.role,
    );
  }

  private async completeLink(
    transaction: Awaited<ReturnType<OidcService['consumeTransaction']>>,
    issuer: string,
    subject: string,
    email: string,
  ) {
    if (!transaction.linkUserId || !transaction.linkReason) {
      throw new UnauthorizedException('The account-link transaction is incomplete');
    }
    const linkUserId = transaction.linkUserId;
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${linkUserId} FOR UPDATE`;
      const user = await database.user.findUnique({
        where: { id: linkUserId },
        select: { email: true, emailVerifiedAt: true, status: true },
      });
      const membership = await database.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId: linkUserId,
            tenantId: transaction.tenantId,
          },
        },
        include: { tenant: { select: { status: true, trialEndsAt: true } } },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !user.emailVerifiedAt ||
        membership?.status !== 'ACTIVE' ||
        !this.isOperationalTenant(membership.tenant)
      ) {
        throw new ForbiddenException('The account is no longer eligible for external identity linking');
      }
      if (user.email.trim().toLowerCase() !== email) {
        throw new ForbiddenException(
          'The verified provider email must exactly match the signed-in account email',
        );
      }
      const existing = await database.externalIdentity.findUnique({
        where: { issuer_subject: { issuer, subject } },
      });
      if (existing && existing.userId !== linkUserId) {
        throw new ConflictException('This provider identity is already linked to another account');
      }
      const linkedAt = new Date();
      const identity = existing
        ? await database.externalIdentity.update({
            where: { id: existing.id },
            data: {
              status: 'ACTIVE',
              statusReason: null,
              revokedAt: null,
              lastLoginAt: linkedAt,
            },
          })
        : await database.externalIdentity.create({
            data: {
              issuer,
              subject,
              userId: linkUserId,
              configurationId: transaction.configurationId,
              lastLoginAt: linkedAt,
            },
          });
      await database.auditLog.create({
        data: {
          action: existing ? 'STATUS_CHANGE' : 'CREATE',
          resource: 'external_identity',
          resourceId: identity.id,
          tenantId: transaction.tenantId,
          userId: linkUserId,
          ...(existing
            ? { before: { status: existing.status, revokedAt: existing.revokedAt } }
            : {}),
          after: { status: identity.status, revokedAt: identity.revokedAt },
          metadata: {
            event: existing ? 'PROOF_REVALIDATED' : 'SELF_SERVICE_BINDING_CREATED',
            reason: transaction.linkReason,
            issuer,
          },
        },
      });
      return {
        type: 'EXTERNAL_IDENTITY_LINKED' as const,
        identityId: identity.id,
        tenantId: transaction.tenantId,
        issuer: identity.issuer,
        status: 'ACTIVE' as const,
        updatedAt: identity.updatedAt.toISOString(),
      };
    });
  }

  private async resolveIdentity(
    transaction: Awaited<ReturnType<OidcService['consumeTransaction']>>,
    issuer: string,
    subject: string,
    email: string,
    claimName: unknown,
  ): Promise<{ userId: string; role: string }> {
    return prisma.$transaction(async (database) => {
      const now = new Date();
      const mapped = await database.externalIdentity.findUnique({
        where: { issuer_subject: { issuer, subject } },
        include: { user: true },
      });
      if (mapped) {
        if (mapped.status !== 'ACTIVE') {
          throw new ForbiddenException('This external identity binding has been revoked');
        }
        const membership = await database.tenantMember.findUnique({
          where: { userId_tenantId: { userId: mapped.userId, tenantId: transaction.tenantId } },
          include: { tenant: { select: { status: true, trialEndsAt: true } } },
        });
        if (
          mapped.user.status !== 'ACTIVE' ||
          membership?.status !== 'ACTIVE' ||
          !this.isOperationalTenant(membership.tenant)
        ) {
          throw new ForbiddenException('The mapped user or tenant membership is inactive');
        }
        await database.externalIdentity.update({
          where: { id: mapped.id },
          data: { lastLoginAt: now },
        });
        await database.user.update({
          where: { id: mapped.userId },
          data: {
            lastLoginAt: now,
            ...(mapped.user.email.trim().toLowerCase() === email && !mapped.user.emailVerifiedAt
              ? { emailVerifiedAt: now }
              : {}),
          },
        });
        await this.createLoginAudit(
          database,
          transaction.tenantId,
          mapped.userId,
          mapped.id,
          false,
        );
        return { userId: mapped.userId, role: membership.role };
      }

      const existingUser = await database.user.findUnique({ where: { email } });
      const existingMembership = existingUser
        ? await database.tenantMember.findUnique({
            where: {
              userId_tenantId: { userId: existingUser.id, tenantId: transaction.tenantId },
            },
          })
        : null;
      let userId: string;
      let role: string;
      let jitProvisioned = false;
      if (
        existingUser &&
        existingMembership?.status === 'ACTIVE' &&
        existingUser.status === 'ACTIVE'
      ) {
        userId = existingUser.id;
        role = existingMembership.role;
      } else {
        const emailDomain = email.split('@')[1];
        const trustedDomain = transaction.tenant.customDomain?.toLowerCase();
        if (
          existingUser ||
          !transaction.configuration.allowJitProvisioning ||
          !trustedDomain ||
          emailDomain !== trustedDomain
        ) {
          throw new ForbiddenException(
            'This identity requires an administrator-approved account link',
          );
        }
        const user = await database.user.create({
          data: {
            email,
            emailVerifiedAt: now,
            name:
              typeof claimName === 'string' && claimName.trim()
                ? claimName.trim().slice(0, 100)
                : (email.split('@')[0] ?? 'OIDC user'),
            status: 'ACTIVE',
            lastLoginAt: now,
          },
        });
        const membership = await database.tenantMember.create({
          data: {
            userId: user.id,
            tenantId: transaction.tenantId,
            role: transaction.configuration.defaultRole,
            status: 'ACTIVE',
          },
        });
        userId = user.id;
        role = membership.role;
        jitProvisioned = true;
      }
      const externalIdentity = await database.externalIdentity.create({
        data: {
          issuer,
          subject,
          userId,
          configurationId: transaction.configuration.id,
          lastLoginAt: now,
        },
      });
      if (!jitProvisioned) {
        await database.user.update({
          where: { id: userId },
          data: {
            lastLoginAt: now,
            // The identity provider supplied a signed email_verified=true claim and the
            // existing account was selected only by an exact canonical email match.
            emailVerifiedAt: existingUser?.emailVerifiedAt ?? now,
          },
        });
      }
      await this.createLoginAudit(
        database,
        transaction.tenantId,
        userId,
        externalIdentity.id,
        jitProvisioned,
      );
      return { userId, role };
    });
  }

  private async consumeTransaction(state: string) {
    const stateDigest = this.digestState(state);
    return prisma.$transaction(async (database) => {
      const rows = await database.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "oidc_login_transactions"
        WHERE "stateDigest" = ${stateDigest}
        FOR UPDATE
      `;
      if (!rows[0]) throw new UnauthorizedException('Invalid or expired OIDC state');
      const current = await database.oidcLoginTransaction.findUnique({
        where: { id: rows[0].id },
        include: { configuration: true, tenant: true },
      });
      if (!current || current.consumedAt || current.expiresAt <= new Date()) {
        throw new UnauthorizedException('Invalid or expired OIDC state');
      }
      await database.oidcLoginTransaction.update({
        where: { id: current.id },
        data: { consumedAt: new Date() },
      });
      return current;
    });
  }

  private async consumeRejectedProviderState(state: string, providerError: string) {
    try {
      const transaction = await this.consumeTransaction(state);
      await prisma.auditLog.create({
        data: {
          action: transaction.purpose === 'LOGIN' ? 'LOGIN' : 'UPDATE',
          resource: transaction.purpose === 'LOGIN' ? 'oidc_login' : 'external_identity_link',
          resourceId: transaction.linkUserId,
          tenantId: transaction.tenantId,
          userId: transaction.linkUserId,
          metadata: {
            event:
              transaction.purpose === 'LOGIN'
                ? 'PROVIDER_REJECTED'
                : 'ACCOUNT_LINK_PROVIDER_REJECTED',
            providerError: providerError.slice(0, 200),
          },
        },
      });
    } catch {
      // Keep provider errors generic when state cannot be authenticated.
    }
  }

  private async discover(issuer: string, clientId: string, clientSecret: string) {
    try {
      return await oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, {
        timeout: PROVIDER_TIMEOUT_SECONDS,
        [oidc.customFetch]: this.safeFetch.bind(this),
        ...(this.allowTestLoopback ? { execute: [oidc.allowInsecureRequests] } : {}),
      });
    } catch (error) {
      const code = error instanceof Error ? error.name : 'DiscoveryError';
      throw new HttpException(
        { code: 'OIDC_PROVIDER_UNAVAILABLE', message: 'OIDC discovery failed', reason: code },
        503,
      );
    }
  }

  private async safeFetch(input: string, options: oidc.CustomFetchOptions): Promise<Response> {
    const target = new URL(input);
    await this.assertSafeProviderUrl(target);
    return fetch(target, {
      method: options.method,
      headers: options.headers,
      ...(options.body === undefined ? {} : { body: options.body as BodyInit }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      redirect: 'error',
    });
  }

  private async assertSafeProviderUrl(target: URL): Promise<void> {
    if (target.username || target.password) throw new Error('OIDC URLs cannot contain credentials');
    if (target.protocol !== 'https:' && !(this.allowTestLoopback && target.protocol === 'http:')) {
      throw new Error('OIDC provider requests require HTTPS');
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) throw new Error('OIDC provider did not resolve');
    for (const { address } of addresses) {
      if (
        isForbiddenOidcAddress(address) &&
        !(this.allowTestLoopback && isLoopbackOidcAddress(address))
      ) {
        throw new Error('OIDC provider resolves to a private or reserved network');
      }
    }
  }

  private normalizeIssuer(value: string): string {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new BadRequestException(
        'OIDC issuer cannot contain credentials, a query, or a fragment',
      );
    }
    if (parsed.protocol !== 'https:' && !(this.allowTestLoopback && parsed.protocol === 'http:')) {
      throw new BadRequestException('OIDC issuer must use HTTPS');
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.toString().replace(/\/$/, '');
  }

  private isOperationalTenant(tenant: { status: string; trialEndsAt: Date | null }): boolean {
    return (
      tenant.status === 'ACTIVE' ||
      (tenant.status === 'TRIAL' && !!tenant.trialEndsAt && tenant.trialEndsAt > new Date())
    );
  }

  private requireRedirectUri(): URL {
    const value = this.requireEnvironmentValue('OIDC_REDIRECT_URI');
    const parsed = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('OIDC_REDIRECT_URI cannot contain credentials, a query, or a fragment.');
    }
    if (
      parsed.protocol !== 'https:' &&
      !(this.allowTestLoopback && parsed.protocol === 'http:' && loopback)
    ) {
      throw new Error('OIDC_REDIRECT_URI must use HTTPS (HTTP is test-only on loopback).');
    }
    return parsed;
  }

  private async decryptConfigurationSecret(configuration: {
    id: string;
    tenantId: string;
    clientSecretEnvelope: string;
    keyVersion: string;
  }): Promise<string> {
    return decrypt(
      configuration.clientSecretEnvelope,
      this.requireDecryptionKey(
        configuration.keyVersion,
        'The OIDC client-secret encryption key version is unavailable',
      ),
      this.configurationContext(configuration.id, configuration.tenantId),
    );
  }

  private requireDecryptionKey(version: string, message: string): string {
    try {
      return requireAes256KeyVersion(this.decryptionKeys, version);
    } catch {
      throw new ConflictException(message);
    }
  }

  private digestState(state: string): string {
    return createHash('sha256').update(state, 'utf8').digest('hex');
  }

  private configurationContext(configurationId: string, tenantId: string): string {
    return `gigalibs:oidc-client:v1:${configurationId}:${tenantId}`;
  }

  private flowContext(transactionId: string, tenantId: string): string {
    return `gigalibs:oidc-flow:v1:${transactionId}:${tenantId}`;
  }

  private async auditCallbackFailure(
    tenantId: string,
    event: string,
    error?: unknown,
    userId?: string,
  ) {
    await prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        resource: 'oidc_login',
        tenantId,
        ...(userId ? { userId } : {}),
        metadata: {
          event,
          ...(error instanceof Error ? { errorType: error.name } : {}),
        },
      },
    });
  }

  private async createLoginAudit(
    database: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    tenantId: string,
    userId: string,
    identityId: string,
    jitProvisioned: boolean,
  ) {
    await database.auditLog.create({
      data: {
        action: 'LOGIN',
        resource: 'external_identity',
        resourceId: identityId,
        tenantId,
        userId,
        metadata: { event: 'OIDC_LOGIN_SUCCEEDED', jitProvisioned },
      },
    });
  }

  private requireEnvironmentValue(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} must be configured.`);
    return value;
  }

  private requireCanonicalEncryptionKey(name: string): string {
    const value = this.requireEnvironmentValue(name);
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== value) {
      throw new Error(`${name} must be a canonical base64-encoded 32-byte key.`);
    }
    return value;
  }
}
