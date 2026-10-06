import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import { holdsPermission } from '@gigalibs/contracts';
import { SAGA_CONFIG } from '../config.provider.js';
import type { SagaRuntimeConfig } from '../runtime-config.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSIONS_METADATA = 'saga.required-permissions';

export interface SagaPrincipal {
  tenantId: string;
  userId: string;
  issuer: string;
  permissions: readonly string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: SagaPrincipal;
  correlationId?: string;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SagaPrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.principal) {
      throw new UnauthorizedException('Request is unauthenticated.');
    }
    return req.principal;
  },
);

@Injectable()
export class OidcAuthorizationGuard implements CanActivate {
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(SAGA_CONFIG) private readonly config: SagaRuntimeConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    if (!config.allowInsecureOidc && config.oidcJwksUri.startsWith('https://')) {
      try {
        this.jwks = createRemoteJWKSet(new URL(config.oidcJwksUri), {
          timeoutDuration: 3_000,
          cooldownDuration: 30_000,
          cacheMaxAge: 600_000,
        });
      } catch {
        // Dev fallback
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const xTenantId = typeof request.headers['x-tenant-id'] === 'string' ? request.headers['x-tenant-id'] : undefined;
    const xUserId = typeof request.headers['x-user-id'] === 'string' ? request.headers['x-user-id'] : undefined;

    let tenantId: string;
    let userId = xUserId || 'system-user';
    let issuer = 'gigalibs-auth';
    let permissions: string[] = ['saga:read', 'saga:write', 'saga:admin'];

    if (authHeader) {
      const token = extractBearerToken(authHeader);
      if (this.jwks) {
        try {
          const { payload } = await jwtVerify(token, this.jwks, {
            issuer: this.config.oidcIssuer,
            audience: this.config.oidcAudience,
            algorithms: [...this.config.oidcAlgorithms],
            clockTolerance: 5,
          });
          const rawTenant = payload[this.config.tenantClaim];
          if (typeof rawTenant !== 'string' || !UUID_PATTERN.test(rawTenant)) {
            throw new UnauthorizedException('Token contains an invalid tenant claim.');
          }
          tenantId = rawTenant;
          userId = typeof payload.sub === 'string' ? payload.sub : userId;
          issuer = typeof payload.iss === 'string' ? payload.iss : issuer;
          const rawPerms = payload[this.config.permissionsClaim];
          if (Array.isArray(rawPerms)) {
            permissions = rawPerms.filter((p): p is string => typeof p === 'string');
          }
        } catch {
          throw new UnauthorizedException('Invalid or expired bearer token.');
        }
      } else if (this.config.allowInsecureOidc && xTenantId) {
        tenantId = xTenantId;
      } else {
        throw new UnauthorizedException('OIDC validation unavailable.');
      }
    } else if (this.config.allowInsecureOidc && xTenantId) {
      if (!UUID_PATTERN.test(xTenantId)) {
        throw new UnauthorizedException('Invalid tenant identifier format.');
      }
      tenantId = xTenantId;
    } else {
      throw new UnauthorizedException('Authentication required: missing token or tenant identity.');
    }

    request.principal = Object.freeze({
      tenantId,
      userId,
      issuer,
      permissions: Object.freeze(permissions),
    });

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // The one permission rule (WI-OI-120q): `*`, the exact code, or its family's wildcard. Before it, a family
    // wildcard such as `ontology:*` was refused here although the web allowed it.
    for (const permission of requiredPermissions) {
      if (!holdsPermission(permissions, permission)) {
        throw new ForbiddenException(`Missing required permission: ${permission}`);
      }
    }

    return true;
  }
}

function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string') {
    throw new UnauthorizedException('Authorization header is missing or malformed.');
  }
  const match = /^Bearer\s+([A-Za-z0-9-_.~+/]+=*)$/.exec(header.trim());
  if (!match || !match[1]) {
    throw new UnauthorizedException('Authorization header must use Bearer scheme.');
  }
  return match[1];
}
