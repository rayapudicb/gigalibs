import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PlatformContextError,
  verifyPlatformContextToken,
  type PlatformContextV1,
} from '@gigalibs/auth-core';
import { GIGAOPS_CONFIG } from '../config.provider.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import type { GigaOpsRuntimeConfig } from '../runtime-config.js';

const PERMISSIONS_METADATA = 'workforce.required-permissions';
const ANY_PERMISSION_METADATA = 'workforce.any-permission';
const LEGACY_ROLES_METADATA = 'workforce.legacy-role-boundary';
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface GigaOpsPrincipal {
  readonly tenantId: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly authVersion: number;
  readonly permissions: readonly string[];
  readonly roles: readonly string[];
  readonly persona: PlatformContextV1['persona_type'];
  readonly orgScope: PlatformContextV1['org_scope'];
  /** WI-OI-109e3: present once the tenant's organization tree is in force; then it decides, not `orgScope`. */
  readonly organization?: NonNullable<PlatformContextV1['organization']>;
  /** Tokens minted before spatial scoping carry no scope and mean UNBOUNDED (WI-OI-065 positions have sites). */
  readonly spatialScope: NonNullable<PlatformContextV1['spatial_scope']>;
}

export interface AuthenticatedGigaOpsRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  principal?: GigaOpsPrincipal;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

/**
 * At least one of the permissions (WI-OI-069): routes that serve both a worker's own time and a manager's view
 * of others; the service then decides whose records the caller may touch.
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSION_METADATA, permissions);

/**
 * Prototype controllers still compile as source inventory but are not registered
 * in the runtime module. If one is registered accidentally, its former role
 * decorator causes the guard to fail closed instead of treating a persona as a
 * permission.
 */
export const RequireRoles = (...roles: string[]) =>
  SetMetadata(LEGACY_ROLES_METADATA, roles);

export const CurrentWorkforcePrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GigaOpsPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedGigaOpsRequest>();
    if (!request.principal) throw new UnauthorizedException('Request is unauthenticated.');
    return request.principal;
  },
);

@Injectable()
export class GigaOpsAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(GIGAOPS_CONFIG) private readonly config: GigaOpsRuntimeConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly database: WorkforceDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedGigaOpsRequest>();
    const token = extractBearerToken(request.headers.authorization);

    let platformContext: PlatformContextV1;
    try {
      platformContext = verifyPlatformContextToken(
        token,
        this.config.platformContextPublicKey,
        this.config.platformContextAudience,
      );
    } catch (error) {
      if (error instanceof PlatformContextError) {
        throw new UnauthorizedException('Platform context token is invalid or expired.');
      }
      throw new UnauthorizedException('Platform context verification failed.');
    }

    if (
      platformContext.entitlement.status !== 'ENABLED' ||
      platformContext.entitlement.module_key !== 'gigaops'
    ) {
      throw new ForbiddenException('The GigaOps Workforce entitlement is not active.');
    }
    if (!TENANT_ID_PATTERN.test(platformContext.tenant_id)) {
      throw new UnauthorizedException('Platform context contains an invalid tenant identifier.');
    }

    const legacyRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      LEGACY_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (legacyRoles && legacyRoles.length > 0) {
      throw new ForbiddenException(
        'This prototype role-based route is contained until it is migrated to Workforce permissions.',
      );
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const anyPermission =
      this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSION_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (anyPermission.length > 0 && !anyPermission.some((permission) => hasPermission(platformContext.granted_scopes, permission))) {
      throw new ForbiddenException(`Missing one of the permissions: ${anyPermission.join(', ')}`);
    }
    for (const permission of requiredPermissions) {
      if (!hasPermission(platformContext.granted_scopes, permission)) {
        throw new ForbiddenException(`Missing required permission: ${permission}`);
      }
    }

    try {
      const revoked = await this.database.isContextRevoked({
        tenantId: platformContext.tenant_id,
        subject: platformContext.sub,
        sessionId: platformContext.session_id,
        authVersion: platformContext.auth_version,
      });
      if (revoked) throw new UnauthorizedException('Platform context has been revoked.');
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException('Authorization state is temporarily unavailable.');
    }

    request.principal = Object.freeze({
      tenantId: platformContext.tenant_id,
      subject: platformContext.sub,
      sessionId: platformContext.session_id,
      authVersion: platformContext.auth_version,
      permissions: Object.freeze([...platformContext.granted_scopes]),
      roles: Object.freeze([...platformContext.roles]),
      persona: platformContext.persona_type,
      orgScope: Object.freeze(platformContext.org_scope),
      ...(platformContext.organization ? { organization: Object.freeze(platformContext.organization) } : {}),
      spatialScope: Object.freeze(platformContext.spatial_scope ?? { mode: 'UNBOUNDED' as const }),
    });
    return true;
  }
}

export function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string') {
    throw new UnauthorizedException('Authorization header is missing or malformed.');
  }
  const match = /^Bearer\s+([^\s]+)$/.exec(header.trim());
  if (!match?.[1]) {
    throw new UnauthorizedException('Authorization header must use the Bearer scheme.');
  }
  return match[1];
}

/** The Workforce permission rule, exported for checks a route-level permission cannot express (WI-OI-120n). */
export function hasWorkforcePermission(granted: readonly string[], required: string): boolean {
  return hasPermission(granted, required);
}

function hasPermission(granted: readonly string[], required: string): boolean {
  return (
    granted.includes('*') ||
    granted.includes('workforce:*') ||
    granted.includes(required) ||
    // WI-OI-109e2: another family's wildcard (`organization:*`) covers its own permissions, as in the core and web.
    granted.includes(`${required.split(/[:.]/)[0]}:*`)
  );
}
