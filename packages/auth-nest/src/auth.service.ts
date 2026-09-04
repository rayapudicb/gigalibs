import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '@gigalibs/db';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  signJwt,
  verifyPassword,
} from '@gigalibs/auth-core';
import type { RegisterWithEmailDto, LoginWithEmailDto, AuthResponse } from '@gigalibs/contracts';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly accessExpirySeconds: number;
  private readonly refreshExpiryDays: number;

  constructor() {
    const secret = process.env['JWT_ACCESS_SECRET'];
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }
    this.accessSecret = secret;
    this.accessExpirySeconds = this.parseDurationSeconds('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiryDays = this.parseDurationSeconds('JWT_REFRESH_EXPIRES_IN') / 86_400;
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

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = await prisma.tenantMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
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

    if (!session || session.status !== 'ACTIVE' || session.expiresAt < new Date()) {
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
        })
      : null;
    const activeMembership = membership?.status === 'ACTIVE' ? membership : null;

    // Rotate refresh token and clear a tenant that is no longer authorized.
    const newRefresh = generateRefreshToken(this.refreshExpiryDays);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: hashRefreshToken(newRefresh.refreshToken),
        expiresAt: newRefresh.expiresAt,
        tenantId: activeMembership?.tenantId ?? null,
      },
    });

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

    return {
      accessToken,
      refreshToken: newRefresh.refreshToken,
      expiresIn: this.accessExpirySeconds,
      tokenType: 'Bearer',
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
      }),
    ]);

    if (!session) {
      throw new UnauthorizedException('Session is invalid, expired, or revoked');
    }
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not an active member of this tenant');
    }

    const refreshData = generateRefreshToken(this.refreshExpiryDays);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        tenantId,
        refreshToken: hashRefreshToken(refreshData.refreshToken),
        expiresAt: refreshData.expiresAt,
      },
    });

    return this.issueTokens(
      userId,
      session.id,
      refreshData.refreshToken,
      tenantId,
      [membership.role],
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
          select: { id: true, email: true, name: true, status: true },
        },
        tenant: {
          select: { id: true, slug: true, name: true, status: true, region: true, plan: true },
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
        })
      : null;

    if (tenantId && (!membership || membership.status !== 'ACTIVE')) {
      throw new ForbiddenException('Tenant membership is inactive or has been revoked');
    }

    return {
      user: session.user,
      tenant: session.tenant,
      roles: membership ? [membership.role] : [],
      permissions: membership?.permissions ?? [],
      session: { id: session.id, expiresAt: session.expiresAt },
    };
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

    return this.issueTokens(
      userId,
      session.id,
      refreshData.refreshToken,
      tenantId,
      roles,
    );
  }

  private issueTokens(
    userId: string,
    sessionId: string,
    refreshToken: string,
    tenantId?: string,
    roles: string[] = [],
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
    };
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
}
