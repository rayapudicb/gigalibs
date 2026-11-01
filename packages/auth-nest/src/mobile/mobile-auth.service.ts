import { generateRefreshToken } from '@gigalibs/auth-core';
import {
  MOBILE_MEMBERSHIP_PAGE_LIMIT,
  MOBILE_PROBLEMS,
  MobileInstallationIdSchema,
  MobileLogoutV1Schema,
  type MobileMembershipPageV1,
  MobileMembershipSelectionV1Schema,
  MobileMfaVerificationV1Schema,
  type MobilePasswordAuthResultV1,
  MobilePasswordSignInV1Schema,
  type MobileProblemCode,
  MobileRefreshTokenV1Schema,
  type MobileSessionV3,
  type MobileTokenSetV2,
  mobileProblem,
} from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import { HttpException, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { AuthService } from '../auth.service.js';
import {
  type MobileAccessClaims,
  MobileKeys,
  appVersionAtLeast,
  opaqueValue,
  parseAppVersion,
  refreshLifetimeSeconds,
  sameText,
  sha256Hex,
} from './mobile-credentials.js';
import { MobileSessionUnavailableError, projectMobileSession } from './mobile-session-projection.js';

// WI-OI-120cf: the mobile v1 BFF's identity and session flows. Credentials, the login lock, the TOTP check, membership
// and the session context are the control plane's own (AuthService); this adds what mobile needs on top: no token
// before the second factor, a short mobile-only access token bound to the installation and app profile, opaque
// short-lived workspace choices, an idempotent switch, and refresh rotation where a reused token ends the session.

const MFA_CHALLENGE_SECONDS = 300;
const MFA_CHALLENGE_ATTEMPTS = 5;
const CHOICE_SECONDS = 300;
const SWITCH_OUTCOME_SECONDS = 300;

/** The words a workspace choice shows for the member's base role. */
const MEMBERSHIP_LABELS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'Super administrator',
  TENANT_ADMIN: 'Administrator',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  GUEST: 'Guest',
};

export class MobileProblemException extends HttpException {
  constructor(
    readonly code: MobileProblemCode,
    correlationId?: string,
  ) {
    super(mobileProblem(code, correlationId), MOBILE_PROBLEMS[code].status);
  }
}

const refuse = (code: MobileProblemCode) => new MobileProblemException(code);

/** The headers a mobile request carries; nothing else of the request is read (no cookie, no tenant header). */
export interface MobileRequest {
  readonly authorization?: string;
  readonly installationId?: string;
  readonly idempotencyKey?: string;
  readonly appVersion?: string;
}

interface SessionBinding {
  readonly userId: string;
  readonly sessionId: string;
  readonly tenantId: string | null;
  readonly appProfile: string;
  readonly installationId: string;
}

interface AuthenticatedSession {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly mfaVerifiedAt: Date | null;
  readonly expiresAt: Date;
  readonly user: { readonly status: string };
  readonly mobile: { readonly appProfile: string; readonly installationId: string; readonly refreshTokenHash: string; readonly revision: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** An unreadable policy counts as requiring MFA: mobile never signs in past a policy it cannot read. */
function enforcesMfa(security: unknown): boolean {
  return isRecord(security) && typeof security.enforceMfa === 'boolean' ? security.enforceMfa : true;
}

function inService(tenant: { status: string; trialEndsAt: Date | null }, now = new Date()): boolean {
  return tenant.status === 'ACTIVE' || (tenant.status === 'TRIAL' && !!tenant.trialEndsAt && tenant.trialEndsAt > now);
}

/** A contract schema: what `parseBody` needs of a zod schema. */
interface Contract<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

function parseBody<T>(schema: Contract<T>, body: unknown, version: string): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const declared = isRecord(body) ? body.contractVersion : undefined;
  throw refuse(typeof declared === 'string' && declared !== version ? 'MOBILE_CONTRACT_UNSUPPORTED' : 'MOBILE_REQUEST_INVALID');
}

@Injectable()
export class MobileAuthService {
  private readonly logger = new Logger(MobileAuthService.name);
  private readonly keys: MobileKeys;
  private readonly refreshDays: number;
  private readonly appProfiles: ReadonlySet<string>;
  private readonly minimumAppVersion: ReturnType<typeof parseAppVersion>;

  constructor(private readonly auth: AuthService) {
    this.keys = new MobileKeys(process.env.JWT_ACCESS_SECRET ?? '');
    this.refreshDays = refreshLifetimeSeconds() / 86_400;
    // The oldest app version this deployment serves (`MOBILE_MIN_APP_VERSION`, e.g. 1.2.0); unset: any version.
    const minimum = process.env.MOBILE_MIN_APP_VERSION?.trim();
    this.minimumAppVersion = minimum ? parseAppVersion(minimum) : null;
    if (minimum && !this.minimumAppVersion) throw new Error('MOBILE_MIN_APP_VERSION must be a version such as 1.2.0.');
    // The app profiles this deployment serves (the build-owned `appProfile` of each signed app). None: mobile is off.
    this.appProfiles = new Set(
      (process.env.MOBILE_APP_PROFILES ?? '')
        .split(',')
        .map((profile) => profile.trim())
        .filter(Boolean),
    );
  }

  async passwordSignIn(body: unknown, request: MobileRequest): Promise<MobilePasswordAuthResultV1> {
    this.requireSupportedApp(request);
    const input = parseBody(MobilePasswordSignInV1Schema, body, 'mobile-password-sign-in.v1');
    this.requireProfile(input.appProfile);
    const installationId = this.installation(request);
    let userId: string;
    try {
      userId = (await this.auth.authenticatePassword(input.email, input.password)).id;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) throw refuse('MOBILE_INVALID_CREDENTIALS');
      if (error instanceof HttpException && error.getStatus() === 429) throw refuse('MOBILE_ACCOUNT_LOCKED');
      throw error;
    }
    const eligible = await this.eligibleMemberships(userId);
    if (eligible.length === 0) throw refuse('MOBILE_MEMBERSHIP_NONE');
    const tenantId = eligible.length === 1 ? (eligible[0]?.tenantId ?? null) : null;

    // The second factor is asked once, at sign-in, when any workspace the user may enter requires it, so no
    // workspace is entered on a password alone; the switch then keeps it (the factor proves the person, not the
    // workspace). The web asks it after a workspace is chosen; mobile issues no token before it.
    if (eligible.some((membership) => enforcesMfa(membership.tenant.settings?.security))) {
      const credential = await prisma.totpCredential.findUnique({ where: { userId }, select: { verifiedAt: true } });
      if (!credential?.verifiedAt) throw refuse('MOBILE_MFA_ENROLLMENT_REQUIRED');
      const challengeId = opaqueValue();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_SECONDS * 1_000);
      await prisma.mobileMfaChallenge.deleteMany({ where: { userId, expiresAt: { lt: now } } });
      await prisma.mobileMfaChallenge.create({
        data: { challengeHash: sha256Hex(challengeId), userId, tenantId, appProfile: input.appProfile, installationId, expiresAt },
      });
      return { contractVersion: 'mobile-mfa-challenge.v1', challengeId, method: 'TOTP', expiresAt: expiresAt.toISOString() };
    }
    return prisma.$transaction((transaction) =>
      this.startSession(transaction, { userId, tenantId, appProfile: input.appProfile, installationId }, null),
    );
  }

  async verifyMfa(body: unknown, request: MobileRequest): Promise<MobileTokenSetV2> {
    this.requireSupportedApp(request);
    const input = parseBody(MobileMfaVerificationV1Schema, body, 'mobile-mfa-verification.v1');
    this.requireProfile(input.appProfile);
    const installationId = this.installation(request);
    const challengeHash = sha256Hex(input.challengeId);
    const challenge = await prisma.mobileMfaChallenge.findUnique({ where: { challengeHash } });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.failedAttempts >= MFA_CHALLENGE_ATTEMPTS
    ) {
      throw refuse('MOBILE_MFA_EXPIRED');
    }
    if (challenge.installationId !== installationId || challenge.appProfile !== input.appProfile) {
      // A challenge presented by another installation or app is spent, not tried.
      await prisma.mobileMfaChallenge.updateMany({ where: { challengeHash, consumedAt: null }, data: { consumedAt: new Date() } });
      throw refuse('MOBILE_MFA_EXPIRED');
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId }, select: { status: true } });
    if (user?.status !== 'ACTIVE') throw refuse('MOBILE_MFA_EXPIRED');
    const eligible = await this.eligibleMemberships(challenge.userId);
    if (eligible.length === 0) throw refuse('MOBILE_MEMBERSHIP_NONE');
    const tenantId = eligible.length === 1 ? (eligible[0]?.tenantId ?? null) : null;
    try {
      return await this.auth.verifyTotpForSignIn(challenge.userId, input.code, tenantId, async (transaction, verifiedAt) => {
        const consumed = await transaction.mobileMfaChallenge.updateMany({
          where: { challengeHash, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: verifiedAt },
        });
        if (consumed.count !== 1) throw refuse('MOBILE_MFA_EXPIRED');
        return this.startSession(
          transaction,
          { userId: challenge.userId, tenantId, appProfile: challenge.appProfile, installationId },
          verifiedAt,
        );
      });
    } catch (error) {
      if (error instanceof MobileProblemException || !(error instanceof HttpException)) throw error;
      const status = error.getStatus();
      if (status === 401) {
        await prisma.mobileMfaChallenge.updateMany({ where: { challengeHash, consumedAt: null }, data: { failedAttempts: { increment: 1 } } });
        throw refuse('MOBILE_MFA_INVALID');
      }
      if (status === 429) throw refuse('MOBILE_ACCOUNT_LOCKED');
      if (status === 409) throw refuse('MOBILE_MFA_ENROLLMENT_REQUIRED');
      throw error;
    }
  }

  async memberships(request: MobileRequest): Promise<MobileMembershipPageV1> {
    this.requireSupportedApp(request);
    const { claims, session } = await this.authenticate(request);
    this.requireCurrent(claims, session);
    const eligible = await this.eligibleMemberships(session.userId);
    if (eligible.length === 0) throw refuse('MOBILE_MEMBERSHIP_NONE');
    const used = await prisma.session.groupBy({
      by: ['tenantId'],
      where: { userId: session.userId, tenantId: { in: eligible.map((membership) => membership.tenantId) } },
      _max: { createdAt: true },
    });
    const lastUsed = new Map(used.map((row) => [row.tenantId, row._max.createdAt ?? null]));
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + CHOICE_SECONDS * 1_000);
    const items = eligible
      .map((membership) => ({ membership, lastUsedAt: lastUsed.get(membership.tenantId) ?? null }))
      .sort(
        (left, right) =>
          (right.lastUsedAt?.getTime() ?? 0) - (left.lastUsedAt?.getTime() ?? 0) ||
          left.membership.tenant.name.localeCompare(right.membership.tenant.name),
      )
      .slice(0, MOBILE_MEMBERSHIP_PAGE_LIMIT)
      .map(({ membership, lastUsedAt }) => ({
        selectionId: this.keys.seal('selection', {
          s: session.id,
          m: membership.id,
          i: claims.ins,
          p: claims.prf,
          e: expiresAt.getTime(),
        }),
        tenantDisplayName: membership.tenant.name.trim().slice(0, 200) || membership.tenantId,
        membershipLabel: MEMBERSHIP_LABELS[membership.role] ?? 'Member',
        lastUsedAt: lastUsedAt?.toISOString() ?? null,
      }));
    return {
      contractVersion: 'mobile-membership-page.v1',
      items,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async switchWorkspace(body: unknown, request: MobileRequest): Promise<MobileTokenSetV2> {
    this.requireSupportedApp(request);
    const input = parseBody(MobileMembershipSelectionV1Schema, body, 'mobile-membership-selection.v1');
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    if (request.idempotencyKey?.trim().toLowerCase() !== idempotencyKey) throw refuse('MOBILE_REQUEST_INVALID');
    const { claims, session } = await this.authenticate(request);
    const selectionHash = sha256Hex(input.selectionId);
    const replay = () => this.replaySwitch(session, idempotencyKey, selectionHash);
    const earlier = await replay();
    if (earlier) return earlier;

    this.requireCurrent(claims, session);
    const choice = this.keys.open('selection', input.selectionId);
    if (
      !isRecord(choice) ||
      choice.s !== session.id ||
      choice.i !== claims.ins ||
      choice.p !== claims.prf ||
      typeof choice.m !== 'string' ||
      typeof choice.e !== 'number'
    ) {
      throw refuse('MOBILE_SCOPE_DENIED');
    }
    if (choice.e <= Date.now()) throw refuse('MOBILE_SELECTION_EXPIRED');
    const membershipId = choice.m;
    try {
      return await prisma.$transaction(async (transaction) => {
        const member = await transaction.tenantMember.findUnique({
          where: { id: membershipId },
          select: {
            userId: true,
            tenantId: true,
            status: true,
            tenant: { select: { status: true, trialEndsAt: true, settings: { select: { security: true } } } },
          },
        });
        if (!member || member.userId !== session.userId || member.status !== 'ACTIVE' || !inService(member.tenant)) {
          throw refuse('MOBILE_MEMBERSHIP_REVOKED');
        }
        // A workspace that started requiring MFA after this sign-in is entered only after signing in again.
        if (enforcesMfa(member.tenant.settings?.security) && !session.mfaVerifiedAt) throw refuse('MOBILE_AUTH_REQUIRED');
        const refresh = generateRefreshToken(this.refreshDays);
        const now = new Date();
        const rotated = await transaction.mobileSession.updateMany({
          where: { sessionId: session.id, refreshTokenHash: session.mobile.refreshTokenHash },
          data: { refreshTokenHash: sha256Hex(refresh.refreshToken), revision: { increment: 1 } },
        });
        if (rotated.count !== 1) throw refuse('MOBILE_AUTH_REQUIRED');
        await transaction.mobileRetiredRefreshToken.create({
          data: { tokenHash: session.mobile.refreshTokenHash, sessionId: session.id },
        });
        const moved = await transaction.session.updateMany({
          where: { id: session.id, status: 'ACTIVE' },
          data: { tenantId: member.tenantId, expiresAt: refresh.expiresAt },
        });
        if (moved.count !== 1) throw refuse('MOBILE_AUTH_REQUIRED');
        await transaction.mobileSwitchOutcome.deleteMany({ where: { sessionId: session.id, expiresAt: { lt: now } } });
        await transaction.mobileSwitchOutcome.create({
          data: {
            sessionId: session.id,
            idempotencyKey,
            selectionHash,
            tenantId: member.tenantId,
            refreshTokenEnvelope: this.keys.seal('switch-outcome', { r: refresh.refreshToken, s: session.id, k: idempotencyKey }),
            expiresAt: new Date(now.getTime() + SWITCH_OUTCOME_SECONDS * 1_000),
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'LOGIN',
            resource: 'mobile_session',
            resourceId: session.id,
            userId: session.userId,
            tenantId: member.tenantId,
            metadata: { event: 'WORKSPACE_SELECTED', appProfile: session.mobile.appProfile },
          },
        });
        return this.tokenSet(
          { userId: session.userId, sessionId: session.id, tenantId: member.tenantId, appProfile: session.mobile.appProfile, installationId: session.mobile.installationId },
          refresh.refreshToken,
        );
      });
    } catch (error) {
      // The same switch sent twice at once: the one that lost answers what the winner stored.
      const stored = await replay().catch(() => null);
      if (stored) return stored;
      throw error;
    }
  }

  async refresh(body: unknown, request: MobileRequest): Promise<MobileTokenSetV2> {
    this.requireSupportedApp(request);
    const input = parseBody(MobileRefreshTokenV1Schema, body, 'mobile-refresh-token.v1');
    this.requireProfile(input.appProfile);
    const installationId = this.installation(request);
    const tokenHash = sha256Hex(input.refreshToken);
    const current = await prisma.mobileSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      select: {
        appProfile: true,
        installationId: true,
        session: {
          select: { id: true, userId: true, tenantId: true, status: true, expiresAt: true, mfaVerifiedAt: true, user: { select: { status: true } } },
        },
      },
    });
    if (!current) {
      const retired = await prisma.mobileRetiredRefreshToken.findUnique({ where: { tokenHash }, select: { sessionId: true } });
      if (retired) await this.revoke(retired.sessionId, 'REFRESH_REUSE_DETECTED');
      throw refuse('MOBILE_AUTH_REQUIRED');
    }
    const { session } = current;
    if (current.installationId !== installationId || current.appProfile !== input.appProfile) {
      await this.revoke(session.id, 'REFRESH_BINDING_MISMATCH');
      throw refuse('MOBILE_AUTH_REQUIRED');
    }
    if (session.status !== 'ACTIVE' || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw refuse('MOBILE_AUTH_REQUIRED');
    }
    if (session.tenantId) {
      try {
        await this.requireLiveTenant(session.userId, session.tenantId, session.mfaVerifiedAt);
      } catch (error) {
        await this.revoke(session.id, 'ACCESS_ENDED');
        throw error;
      }
    }
    const refresh = generateRefreshToken(this.refreshDays);
    const rotated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.mobileSession.updateMany({
        where: { sessionId: session.id, refreshTokenHash: tokenHash },
        data: { refreshTokenHash: sha256Hex(refresh.refreshToken) },
      });
      if (changed.count !== 1) return false;
      await transaction.mobileRetiredRefreshToken.create({ data: { tokenHash, sessionId: session.id } });
      const extended = await transaction.session.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: { expiresAt: refresh.expiresAt },
      });
      if (extended.count !== 1) throw refuse('MOBILE_AUTH_REQUIRED');
      return true;
    });
    if (!rotated) {
      // Another request rotated this token first: the same token was used twice.
      await this.revoke(session.id, 'REFRESH_REUSE_DETECTED');
      throw refuse('MOBILE_AUTH_REQUIRED');
    }
    return this.tokenSet(
      { userId: session.userId, sessionId: session.id, tenantId: session.tenantId, appProfile: current.appProfile, installationId },
      refresh.refreshToken,
    );
  }

  async logout(body: unknown, request: MobileRequest): Promise<void> {
    parseBody(MobileLogoutV1Schema, body, 'mobile-logout.v1');
    const { session } = await this.authenticate(request);
    await this.revoke(session.id, 'SIGNED_OUT');
  }

  async session(request: MobileRequest): Promise<MobileSessionV3> {
    this.requireSupportedApp(request);
    const { claims, session } = await this.authenticate(request);
    this.requireCurrent(claims, session);
    if (!claims.tid) throw refuse('MOBILE_SCOPE_DENIED');
    const tenantId = claims.tid;
    const member = await this.requireLiveTenant(session.userId, tenantId, session.mfaVerifiedAt);
    const [context, roleAssignments] = await Promise.all([
      this.auth.getSessionContext(session.userId, session.id, tenantId),
      prisma.memberRoleAssignment.findMany({
        where: { tenantId, userId: session.userId, revokedAt: null },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    try {
      return projectMobileSession(context, {
        membershipId: member.id,
        roleAssignmentIds: roleAssignments.map((assignment) => assignment.id),
        sessionRevision: session.mobile.revision,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      if (!(error instanceof MobileSessionUnavailableError)) throw error;
      this.logger.warn(`Mobile session projection refused for tenant ${tenantId}: ${error.message}`);
      throw refuse('MOBILE_UNAVAILABLE');
    }
  }

  /** Current server-resolved authority for a module call; never exposed as a mobile response. */
  async moduleSubject(request: MobileRequest) {
    this.requireSupportedApp(request);
    const { claims, session } = await this.authenticate(request);
    this.requireCurrent(claims, session);
    if (!claims.tid) throw refuse('MOBILE_SCOPE_DENIED');
    await this.requireLiveTenant(session.userId, claims.tid, session.mfaVerifiedAt);
    return this.auth.getSessionContext(session.userId, session.id, claims.tid);
  }

  private requireProfile(appProfile: string): void {
    if (!this.appProfiles.has(appProfile)) throw refuse('MOBILE_CONTRACT_UNSUPPORTED');
  }

  /** An app older than the deployment's minimum (or one that does not say its version) must update first. */
  private requireSupportedApp(request: MobileRequest): void {
    if (this.minimumAppVersion && !appVersionAtLeast(request.appVersion, this.minimumAppVersion)) {
      throw refuse('MOBILE_CONTRACT_UNSUPPORTED');
    }
  }

  private installation(request: MobileRequest): string {
    const parsed = MobileInstallationIdSchema.safeParse(request.installationId?.trim());
    if (!parsed.success) throw refuse('MOBILE_REQUEST_INVALID');
    return parsed.data.toLowerCase();
  }

  /** Active memberships of tenants in service: the workspaces a sign-in may enter. */
  private eligibleMemberships(userId: string) {
    const now = new Date();
    return prisma.tenantMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        tenant: { OR: [{ status: 'ACTIVE' }, { status: 'TRIAL', trialEndsAt: { gt: now } }] },
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        tenant: { select: { name: true, settings: { select: { security: true } } } },
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async startSession(
    transaction: Prisma.TransactionClient,
    binding: Omit<SessionBinding, 'sessionId'>,
    mfaVerifiedAt: Date | null,
  ): Promise<MobileTokenSetV2> {
    const refresh = generateRefreshToken(this.refreshDays);
    const session = await transaction.session.create({
      data: {
        userId: binding.userId,
        ...(binding.tenantId ? { tenantId: binding.tenantId } : {}),
        // The web column holds a value nobody has, so the web refresh can never use a mobile session.
        refreshToken: `mobile:${opaqueValue()}`,
        expiresAt: refresh.expiresAt,
        status: 'ACTIVE',
        mfaVerifiedAt,
      },
      select: { id: true },
    });
    await transaction.mobileSession.create({
      data: {
        sessionId: session.id,
        appProfile: binding.appProfile,
        installationId: binding.installationId,
        refreshTokenHash: sha256Hex(refresh.refreshToken),
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'LOGIN',
        resource: 'mobile_session',
        resourceId: session.id,
        userId: binding.userId,
        tenantId: binding.tenantId,
        metadata: { event: 'SIGNED_IN', appProfile: binding.appProfile, mfa: !!mfaVerifiedAt },
      },
    });
    return this.tokenSet({ ...binding, sessionId: session.id }, refresh.refreshToken);
  }

  private tokenSet(binding: SessionBinding, refreshToken: string): MobileTokenSetV2 {
    const claims: MobileAccessClaims = binding.tenantId
      ? { sub: binding.userId, sid: binding.sessionId, tid: binding.tenantId, ins: binding.installationId, prf: binding.appProfile, bnd: 'TENANT_BOUND' }
      : { sub: binding.userId, sid: binding.sessionId, ins: binding.installationId, prf: binding.appProfile, bnd: 'PRE_TENANT' };
    const access = this.keys.signAccess(claims);
    return {
      contractVersion: 'mobile-token-set.v2',
      binding: claims.bnd,
      accessToken: access.token,
      refreshToken,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
    } as MobileTokenSetV2;
  }

  /** The live session behind a valid mobile bearer from the installation it was issued to. */
  private async authenticate(request: MobileRequest) {
    const installationId = this.installation(request);
    const header = request.authorization ?? '';
    const claims = header.startsWith('Bearer ') ? this.keys.verifyAccess(header.slice(7).trim()) : null;
    if (!claims || claims.ins !== installationId || !this.appProfiles.has(claims.prf)) throw refuse('MOBILE_AUTH_REQUIRED');
    const session = await this.findSession(claims.sid, claims.sub);
    if (
      !session ||
      session.user.status !== 'ACTIVE' ||
      session.mobile.installationId !== claims.ins ||
      session.mobile.appProfile !== claims.prf
    ) {
      throw refuse('MOBILE_AUTH_REQUIRED');
    }
    return { claims, session };
  }

  private async findSession(sessionId: string, userId: string): Promise<AuthenticatedSession | null> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        mfaVerifiedAt: true,
        expiresAt: true,
        user: { select: { status: true } },
        mobile: { select: { appProfile: true, installationId: true, refreshTokenHash: true, revision: true } },
      },
    });
    if (!session?.mobile) return null;
    return { ...session, mobile: session.mobile };
  }

  /** A bearer issued before the session's last switch no longer speaks for it. */
  private requireCurrent(claims: MobileAccessClaims, session: AuthenticatedSession): void {
    if ((session.tenantId ?? undefined) !== claims.tid) throw refuse('MOBILE_AUTH_REQUIRED');
  }

  private async requireLiveTenant(userId: string, tenantId: string, mfaVerifiedAt: Date | null) {
    const member = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        status: true,
        tenant: { select: { status: true, trialEndsAt: true, settings: { select: { security: true } } } },
      },
    });
    if (!member || member.status !== 'ACTIVE' || !inService(member.tenant)) throw refuse('MOBILE_MEMBERSHIP_REVOKED');
    if (enforcesMfa(member.tenant.settings?.security) && !mfaVerifiedAt) throw refuse('MOBILE_AUTH_REQUIRED');
    return member;
  }

  /** A retried switch: the outcome stored for this key, while the session has not moved on since. */
  private async replaySwitch(
    session: AuthenticatedSession,
    idempotencyKey: string,
    selectionHash: string,
  ): Promise<MobileTokenSetV2 | null> {
    const prior = await prisma.mobileSwitchOutcome.findUnique({
      where: { sessionId_idempotencyKey: { sessionId: session.id, idempotencyKey } },
    });
    if (!prior || prior.expiresAt <= new Date()) return null;
    if (!sameText(prior.selectionHash, selectionHash)) throw refuse('MOBILE_IDEMPOTENCY_CONFLICT');
    const sealed = this.keys.open('switch-outcome', prior.refreshTokenEnvelope);
    const fresh = await this.findSession(session.id, session.userId);
    if (
      !isRecord(sealed) ||
      typeof sealed.r !== 'string' ||
      sealed.s !== session.id ||
      sealed.k !== idempotencyKey ||
      !fresh ||
      fresh.tenantId !== prior.tenantId ||
      !sameText(fresh.mobile.refreshTokenHash, sha256Hex(sealed.r))
    ) {
      throw refuse('MOBILE_IDEMPOTENCY_CONFLICT');
    }
    await this.requireLiveTenant(session.userId, prior.tenantId, fresh.mfaVerifiedAt);
    return this.tokenSet(
      { userId: session.userId, sessionId: session.id, tenantId: prior.tenantId, appProfile: fresh.mobile.appProfile, installationId: fresh.mobile.installationId },
      sealed.r,
    );
  }

  private async revoke(sessionId: string, event: 'SIGNED_OUT' | 'REFRESH_REUSE_DETECTED' | 'REFRESH_BINDING_MISMATCH' | 'ACCESS_ENDED') {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true, tenantId: true } });
    if (!session) return;
    const ended = await prisma.session.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (event !== 'SIGNED_OUT') this.logger.warn(`Mobile session ended: ${event}.`);
    if (ended.count === 0) return;
    await prisma.auditLog.create({
      data: {
        action: event === 'SIGNED_OUT' ? 'LOGOUT' : 'STATUS_CHANGE',
        resource: 'mobile_session',
        resourceId: sessionId,
        userId: session.userId,
        tenantId: session.tenantId,
        metadata: { event },
      },
    });
  }
}
