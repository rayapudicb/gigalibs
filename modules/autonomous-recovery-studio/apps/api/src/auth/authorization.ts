import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import { holdsPermission } from '@gigalibs/contracts';
import { RECOVERY_CONFIG } from '../config.provider.js';
import type { RecoveryRuntimeConfig } from '../runtime-config.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSIONS_METADATA = 'recovery.required-permissions';

export interface RecoveryPrincipal {
  tenantId: string;
  subject: string;
  issuer: string;
  permissions: readonly string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  recoveryPrincipal?: RecoveryPrincipal;
  correlationId?: string;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RecoveryPrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.recoveryPrincipal) {
      throw new UnauthorizedException('Request is unauthenticated.');
    }
    return request.recoveryPrincipal;
  },
);

@Injectable()
export class OidcAuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(OidcAuthorizationGuard.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(RECOVERY_CONFIG) private readonly config: RecoveryRuntimeConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    this.jwks = createRemoteJWKSet(new URL(config.oidcJwksUri), {
      timeoutDuration: 3_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.oidcIssuer,
        audience: this.config.oidcAudience,
        algorithms: [...this.config.oidcAlgorithms],
        clockTolerance: 5,
        requiredClaims: ['sub', this.config.tenantClaim, this.config.permissionsClaim],
      }));
    } catch (caught) {
      this.logger.error('JWT verification failed:', caught instanceof Error ? caught.stack : caught);
      throw new UnauthorizedException(caught instanceof Error ? caught.message : 'Missing, invalid, or expired bearer token.');
    }

    const tenantId = payload[this.config.tenantClaim];
    if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
      throw new UnauthorizedException('Token contains an invalid tenant claim.');
    }

    const permissionsRaw = payload[this.config.permissionsClaim];
    const permissions = Array.isArray(permissionsRaw)
      ? permissionsRaw.filter((p): p is string => typeof p === 'string')
      : [];

    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    const issuer = typeof payload.iss === 'string' ? payload.iss : '';

    request.recoveryPrincipal = Object.freeze({
      tenantId,
      subject,
      issuer,
      permissions: Object.freeze(permissions),
    });

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // The one permission rule (WI-OI-120q): `*`, the exact code, or its family's wildcard, as the web decides.
    for (const permission of requiredPermissions) {
      if (!holdsPermission(permissions, permission)) {
        throw new ForbiddenException(`Missing required permission: ${permission}`);
      }
    }

    return true;
  }
}

function extractBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new UnauthorizedException('Missing Authorization header.');
  }
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(value.trim());
  if (!match) {
    throw new UnauthorizedException('Invalid Bearer token format.');
  }
  return match[1];
}
