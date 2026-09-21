import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import {
  type PlatformContextV1,
  verifyPlatformContextToken,
  PlatformContextError,
} from '@gigalibs/auth-core';
import { CMMS_CONFIG } from '../config.provider.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSIONS_METADATA = 'cmms.required-permissions';

export interface DepartmentScope {
  mode: 'FLAT_TENANT' | 'SCOPED_DEPARTMENTS';
  /** Resolved department UUIDs from the recursive CTE on the control-plane side. */
  departmentIds?: readonly string[];
}

export interface CmmsPrincipal {
  tenantId: string;
  subject: string;
  issuer: string;
  permissions: readonly string[];
  persona?: string;
  /** Parsed and typed org-scope forwarded from the platform-context token. */
  departmentScope: DepartmentScope;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: CmmsPrincipal;
  correlationId?: string;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

@Injectable()
export class OidcAuthorizationGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(CMMS_CONFIG) private readonly config: CmmsRuntimeConfig,
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

    const platformPublicKey = this.config.platformContextPublicKey;

    if (isEdDsaToken(token)) {
      if (!platformPublicKey?.trim()) {
        throw new UnauthorizedException('Platform context verification key is not configured.');
      }
      let platformContext: PlatformContextV1;
      try {
        platformContext = verifyPlatformContextToken(
          token,
          platformPublicKey,
          this.config.oidcAudience || 'gigalibs-cmms-api',
        );
      } catch (error) {
        if (error instanceof PlatformContextError) {
          throw new UnauthorizedException(`Platform context verification failed: ${error.message}`);
        }
        throw new UnauthorizedException('Missing, invalid, or expired bearer token.');
      }

      if (platformContext.entitlement.status !== 'ENABLED') {
        throw new ForbiddenException(
          `Module '${platformContext.entitlement.module_key}' is not entitled.`,
        );
      }
      if (platformContext.entitlement.module_key !== 'asset-maintenance') {
        throw new ForbiddenException(
          `Platform context token is for module '${platformContext.entitlement.module_key}', not 'asset-maintenance'.`,
        );
      }
      const tenantId = platformContext.tenant_id;
      const subject = platformContext.sub;
      const issuer = platformContext.iss;
      const permissions = platformContext.granted_scopes;

      const rawOrgScope = platformContext.org_scope as { mode?: string; departmentIds?: string[] } | undefined;
      const departmentScope: DepartmentScope = rawOrgScope?.mode === 'SCOPED_DEPARTMENTS'
        ? { mode: 'SCOPED_DEPARTMENTS', departmentIds: Object.freeze(rawOrgScope.departmentIds ?? []) as readonly string[] }
        : { mode: 'FLAT_TENANT' };

      request.principal = Object.freeze({
        tenantId,
        subject,
        issuer,
        permissions: Object.freeze(permissions),
        persona: platformContext.persona_type,
        departmentScope: Object.freeze(departmentScope),
      });

      const requiredPermissions =
        this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];

      for (const permission of requiredPermissions) {
        if (!permissions.includes(permission)) {
          throw new ForbiddenException(`Missing required permission: ${permission}`);
        }
      }

      return true;
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.oidcIssuer,
        audience: this.config.oidcAudience,
        algorithms: [...this.config.oidcAlgorithms],
        clockTolerance: 5,
        requiredClaims: ['sub', this.config.tenantClaim, this.config.permissionsClaim],
      }));
    } catch {
      throw new UnauthorizedException('Missing, invalid, or expired bearer token.');
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

    request.principal = Object.freeze({ tenantId, subject, issuer, permissions: Object.freeze(permissions), departmentScope: Object.freeze<DepartmentScope>({ mode: 'FLAT_TENANT' }) });

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const permission of requiredPermissions) {
      if (!permissions.includes(permission)) {
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

function isEdDsaToken(token: string): boolean {
  try {
    const firstPart = token.split('.')[0];
    if (!firstPart) return false;
    const headerJson = Buffer.from(firstPart, 'base64url').toString('utf8');
    const header = JSON.parse(headerJson);
    return header.alg === 'EdDSA';
  } catch {
    return false;
  }
}
