import { verifyJwt } from '@gigalibs/auth-core';
import { prisma } from '@gigalibs/db';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { Reflector } from '@nestjs/core';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(private readonly reflector: Reflector) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }
    this.jwtSecret = secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyJwt(token, this.jwtSecret);

    if (!payload) {
      throw new UnauthorizedException('Token is invalid or expired');
    }

    const session = await prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      select: {
        tenantId: true,
        mfaVerifiedAt: true,
        user: { select: { status: true } },
        tenant: { select: { settings: { select: { security: true } } } },
      },
    });
    if (
      !session ||
      session.user.status !== 'ACTIVE' ||
      (session.tenantId ?? undefined) !== payload.tid
    ) {
      throw new UnauthorizedException('Session is invalid, expired, or revoked');
    }

    if (session.tenantId) {
      const security = session.tenant?.settings?.security;
      if (!isRecord(security) || typeof security.enforceMfa !== 'boolean') {
        throw new ForbiddenException({
          code: 'MFA_POLICY_UNAVAILABLE',
          message: 'Tenant MFA policy could not be verified.',
        });
      }
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (security.enforceMfa && !session.mfaVerifiedAt && !allowPending) {
        throw new ForbiddenException({
          code: 'MFA_REQUIRED',
          message: 'Complete multi-factor authentication for this session.',
        });
      }
    }

    const member = payload.tid
      ? await prisma.tenantMember.findUnique({
          where: { userId_tenantId: { userId: payload.sub, tenantId: payload.tid } },
          select: { role: true, status: true },
        })
      : null;
    // Signed claims identify the session; current DB membership grants authority.
    // TenantBoundaryGuard enforces membership and tenant lifecycle for the route.
    request.user = { ...payload, roles: member?.status === 'ACTIVE' ? [member.role] : [] };
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
