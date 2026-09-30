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
import { ANALYTICS_CONFIG } from '../config.provider.js';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsRuntimeConfig } from '../runtime-config.js';

const PERMISSIONS_METADATA = 'analytics.required-permissions';
const ANALYTICS_MODULE_KEY = 'analytics-studio';
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface AnalyticsPrincipal {
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

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  analyticsPrincipal?: AnalyticsPrincipal;
  correlationId?: string;
}

/**
 * WI-OI-103e (ADR-0016 F16): the Analytics permissions. `analytics:action` stays for setup, operational actions and
 * Demo Lab. Every guarded route names exactly one of these; a route that names none is refused.
 */
export const ANALYTICS_PERMISSIONS = [
  'analytics:read',
  'analytics:connectors:write',
  'analytics:mappings:write',
  'analytics:models:write',
  'analytics:models:publish',
  'analytics:charts:write',
  'analytics:dashboards:write',
  'analytics:reports:write',
  'analytics:export',
  'analytics:action',
] as const;
export type AnalyticsPermission = (typeof ANALYTICS_PERMISSIONS)[number];

export const RequirePermissions = (...permissions: AnalyticsPermission[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

/** The permissions a route handler declares, or undefined when it declares none. */
export function declaredPermissions(handler: object, controller: object): readonly string[] | undefined {
  return (
    (Reflect.getMetadata(PERMISSIONS_METADATA, handler) as string[] | undefined) ??
    (Reflect.getMetadata(PERMISSIONS_METADATA, controller) as string[] | undefined)
  );
}

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AnalyticsPrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.analyticsPrincipal) {
      throw new UnauthorizedException('Request is unauthenticated.');
    }
    return request.analyticsPrincipal;
  },
);

export const CurrentPrincipal = Principal;
export const PlatformPrincipal = Principal;
export type PlatformPrincipal = AnalyticsPrincipal;

/**
 * Tenant authority comes only from a signed PlatformContextV1 minted by the control-plane BFF for this
 * service's audience (WI-OI-064a). Caller-supplied tenant or user values are never read, and the user's
 * verified scopes — not a service-wide grant — decide each endpoint.
 */
@Injectable()
export class PlatformContextAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(ANALYTICS_CONFIG) private readonly config: AnalyticsRuntimeConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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
      platformContext.entitlement.module_key !== ANALYTICS_MODULE_KEY
    ) {
      throw new ForbiddenException('The Analytics Studio entitlement is not active.');
    }
    if (!TENANT_ID_PATTERN.test(platformContext.tenant_id)) {
      throw new UnauthorizedException('Platform context contains an invalid tenant identifier.');
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    // WI-OI-103e: fail closed. A guarded route that names no permission is refused rather than open to every member.
    if (!required || required.length === 0) {
      throw new ForbiddenException('This Analytics route declares no permission.');
    }
    for (const permission of required) {
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

    request.analyticsPrincipal = Object.freeze({
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

/** `*`, `analytics:*` or the exact permission; `analytics:*` also covers `analytics:connectors:write`. */
function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.includes('*') || granted.includes('analytics:*') || granted.includes(required);
}
