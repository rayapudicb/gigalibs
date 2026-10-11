import { randomUUID } from 'node:crypto';
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
import { PlatformContextError, verifyPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import type { OrganizationClaim } from '@gigalibs/module-sdk';
import { holdsPermission } from '@gigalibs/contracts';
import { CMMS_CONFIG } from '../config.provider.js';
import { DatabaseService } from '../database/database.service.js';
import { CMMS_MODULE_KEY, type CmmsRuntimeConfig } from '../runtime-config.js';

const PERMISSIONS_METADATA = 'cmms.required-permissions';
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Department (org) scope: ALL for flat tenants; otherwise only the listed departments, fail-closed when empty. */
export type CmmsDepartmentScope =
  | { readonly mode: 'ALL' }
  | { readonly mode: 'DEPARTMENTS'; readonly departmentIds: readonly string[] };

/**
 * Spatial scope: ALL when unbounded; otherwise records whose site is exactly one of the scope places. Places
 * below a scope root are not resolved here until a place directory projection exists, so this errs on the side
 * of showing less, never more.
 */
export type CmmsPlaceScope = { readonly mode: 'ALL' } | { readonly mode: 'PLACES'; readonly placeIds: readonly string[] };

export interface CmmsPrincipal {
  readonly tenantId: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly authVersion: number;
  readonly permissions: readonly string[];
  readonly roles: readonly string[];
  readonly persona: PlatformContextV1['persona_type'];
  /** Server-resolved WI-OI-109 organization scope, kept in parity with the shared module guard. */
  readonly organization?: OrganizationClaim;
  readonly departmentScope: CmmsDepartmentScope;
  readonly placeScope: CmmsPlaceScope;
}

export interface CmmsCommandContext {
  readonly principal: CmmsPrincipal;
  readonly correlationId: string;
}

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  cmmsPrincipal?: CmmsPrincipal;
}

export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_METADATA, permissions);

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): CmmsPrincipal => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.cmmsPrincipal) throw new UnauthorizedException('Request is unauthenticated.');
  return request.cmmsPrincipal;
});

/** The verified principal plus a correlation id taken from `X-Correlation-Id` when well-formed. */
export const CommandContext = createParamDecorator((_data: unknown, context: ExecutionContext): CmmsCommandContext => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.cmmsPrincipal) throw new UnauthorizedException('Request is unauthenticated.');
  const header = request.headers['x-correlation-id'];
  const candidate = typeof header === 'string' ? header.trim() : '';
  return {
    principal: request.cmmsPrincipal,
    correlationId: CORRELATION_ID_PATTERN.test(candidate) ? candidate : randomUUID(),
  };
});

/**
 * Tenant authority comes only from a PlatformContextV1 signed by the web BFF with the CMMS key for this
 * audience and the `asset-maintenance` entitlement (WI-OI-038). Caller-supplied tenant or user values are never
 * read; the user's verified scopes decide each endpoint, and revoked sessions are refused.
 */
@Injectable()
export class CmmsAuthorizationGuard implements CanActivate {
  constructor(
    @Inject(CMMS_CONFIG) private readonly config: CmmsRuntimeConfig,
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

    if (platformContext.entitlement.status !== 'ENABLED' || platformContext.entitlement.module_key !== CMMS_MODULE_KEY) {
      throw new ForbiddenException('The Asset & Maintenance entitlement is not active.');
    }
    if (!TENANT_ID_PATTERN.test(platformContext.tenant_id)) {
      throw new UnauthorizedException('Platform context contains an invalid tenant identifier.');
    }

    const required =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    for (const permission of required) {
      if (!hasCmmsPermission(platformContext.granted_scopes, permission)) {
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

    request.cmmsPrincipal = principalFromContext(platformContext);
    (request as any).modulePrincipal = request.cmmsPrincipal;
    return true;
  }
}

export function principalFromContext(context: PlatformContextV1): CmmsPrincipal {
  const org = context.org_scope;
  const spatial = context.spatial_scope ?? { mode: 'UNBOUNDED' as const };
  return Object.freeze({
    tenantId: context.tenant_id,
    subject: context.sub,
    sessionId: context.session_id,
    authVersion: context.auth_version,
    permissions: Object.freeze([...context.granted_scopes]),
    roles: Object.freeze([...context.roles]),
    persona: context.persona_type,
    organization: Object.freeze(
      context.organization?.mode === 'UNITS'
        ? {
            mode: 'UNITS' as const,
            tree_version: context.organization.tree_version,
            read_roots: Object.freeze([...context.organization.read_roots]),
            write_roots: Object.freeze([...context.organization.write_roots]),
          }
        : context.organization?.mode === 'DENIED'
          ? { mode: 'DENIED' as const }
          : context.organization?.tree_version
            ? { mode: 'TENANT' as const, tree_version: context.organization.tree_version }
            : { mode: 'TENANT' as const },
    ),
    departmentScope: Object.freeze(
      org.mode === 'SCOPED_DEPARTMENTS'
        ? { mode: 'DEPARTMENTS' as const, departmentIds: Object.freeze([...org.department_ids]) }
        : { mode: 'ALL' as const },
    ),
    placeScope: Object.freeze(
      spatial.mode === 'SCOPED_PLACES'
        ? { mode: 'PLACES' as const, placeIds: Object.freeze([...spatial.place_ids]) }
        : { mode: 'ALL' as const },
    ),
  });
}

export function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string') throw new UnauthorizedException('Authorization header is missing or malformed.');
  const match = /^Bearer\s+([^\s]+)$/.exec(header.trim());
  if (!match?.[1]) throw new UnauthorizedException('Authorization header must use the Bearer scheme.');
  return match[1];
}

/** The one permission rule (WI-OI-120q): `*`, the exact code, or its family's wildcard (`cmms:*`). */
export function hasCmmsPermission(granted: readonly string[], required: string): boolean {
  return holdsPermission(granted, required);
}
