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
import { GEOSPATIAL_CONFIG } from '../config.provider.js';
import { GeospatialDatabaseService } from '../database/database.service.js';
import type { GeospatialRuntimeConfig } from '../runtime-config.js';

const PERMISSIONS_METADATA = 'geospatial.required-permissions';
const GEOSPATIAL_MODULE_KEY = 'geospatial-studio';
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface GeospatialPrincipal {
  readonly tenantId: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly authVersion: number;
  readonly permissions: readonly string[];
  readonly roles: readonly string[];
  readonly persona: PlatformContextV1['persona_type'];
  readonly orgScope: PlatformContextV1['org_scope'];
  /** Tokens minted before spatial scoping carry no scope and mean UNBOUNDED. */
  readonly spatialScope: NonNullable<PlatformContextV1['spatial_scope']>;
}

export interface AuthenticatedGeospatialRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  principal?: GeospatialPrincipal;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const CurrentGeospatialPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GeospatialPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedGeospatialRequest>();
    if (!request.principal) throw new UnauthorizedException('Request is unauthenticated.');
    return request.principal;
  },
);

/**
 * Tenant authority comes only from a signed PlatformContextV1 minted by the control-plane BFF for this
 * service's audience. Caller-supplied tenant or user headers are never read.
 */
@Injectable()
export class GeospatialAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(GEOSPATIAL_CONFIG) private readonly config: GeospatialRuntimeConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly database: GeospatialDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedGeospatialRequest>();
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
      platformContext.entitlement.module_key !== GEOSPATIAL_MODULE_KEY
    ) {
      throw new ForbiddenException('The Geospatial Studio entitlement is not active.');
    }
    if (!TENANT_ID_PATTERN.test(platformContext.tenant_id)) {
      throw new UnauthorizedException('Platform context contains an invalid tenant identifier.');
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
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

function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.includes('*') || granted.includes('maps:*') || granted.includes(required);
}
