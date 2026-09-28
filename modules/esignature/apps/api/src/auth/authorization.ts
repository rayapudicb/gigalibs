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
import { ESIGN_CONFIG } from '../config.provider.js';
import type { EsignRuntimeConfig } from '../runtime-config.js';

const PERMISSIONS_METADATA = 'esign.required-permissions';

export interface EsignPrincipal {
  tenantId: string;
  subject: string;
  issuer: string;
  permissions: readonly string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  esignPrincipal?: EsignPrincipal;
  correlationId?: string;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): EsignPrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.esignPrincipal) {
      throw new UnauthorizedException('Request is unauthenticated.');
    }
    return request.esignPrincipal;
  },
);

@Injectable()
export class OidcAuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(OidcAuthorizationGuard.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(ESIGN_CONFIG) private readonly config: EsignRuntimeConfig,
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
      }));
    } catch (error) {
      this.logger.warn(`JWT verification failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Invalid or expired bearer token.');
    }

    const tenantId = payload[this.config.tenantClaim];
    if (typeof tenantId !== 'string' || !tenantId) {
      throw new UnauthorizedException(`Missing tenant claim: ${this.config.tenantClaim}`);
    }

    const permissions = normalizePermissions(payload[this.config.permissionsClaim]);
    const principal: EsignPrincipal = {
      tenantId,
      subject: payload.sub ?? 'unknown',
      issuer: typeof payload.iss === 'string' ? payload.iss : this.config.oidcIssuer,
      permissions,
    };

    request.esignPrincipal = principal;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (required && required.length > 0) {
      const hasAll = required.every(
        (perm) =>
          principal.permissions.includes('*') ||
          principal.permissions.includes('esign:*') ||
          principal.permissions.includes(perm),
      );
      if (!hasAll) {
        throw new ForbiddenException(`Missing required permissions: ${required.join(', ')}`);
      }
    }

    return true;
  }
}

function extractBearerToken(headerValue: string | string[] | undefined): string {
  if (!headerValue || Array.isArray(headerValue)) {
    throw new UnauthorizedException('Authorization header is missing or malformed.');
  }
  const [scheme, token] = headerValue.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedException('Authorization header must use the Bearer scheme.');
  }
  return token.trim();
}

function normalizePermissions(claimValue: unknown): readonly string[] {
  if (Array.isArray(claimValue)) {
    return Object.freeze(
      claimValue.filter((item): item is string => typeof item === 'string' && item.length > 0),
    );
  }
  if (typeof claimValue === 'string') {
    return Object.freeze(claimValue.split(' ').filter(Boolean));
  }
  return Object.freeze([]);
}
