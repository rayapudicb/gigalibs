import { randomUUID } from 'node:crypto';
import {
  PlatformContextError,
  type PlatformContextV1,
  verifyPlatformContextToken,
} from '@gigalibs/auth-core';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { ModuleDatabase } from './database.js';
import type { OrganizationClaim } from './organization-access.js';

// WI-OI-085a: the signed-context guard for new modules, following the certified CMMS guard (WI-OI-038). CMMS and
// Workforce keep their own guards until they adopt this one in a separately certified change.

const PERMISSIONS_METADATA = 'gigalibs.module-sdk.required-permissions';
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Department (org) scope: ALL for flat tenants; otherwise only the listed departments, fail-closed when empty. */
export type ModuleDepartmentScope =
  | { readonly mode: 'ALL' }
  | { readonly mode: 'DEPARTMENTS'; readonly departmentIds: readonly string[] };

/** Spatial scope: ALL when unbounded; otherwise only records at exactly one of the scope places. */
export type ModulePlaceScope =
  | { readonly mode: 'ALL' }
  | { readonly mode: 'PLACES'; readonly placeIds: readonly string[] };

export interface ModulePrincipal {
  readonly tenantId: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly authVersion: number;
  readonly permissions: readonly string[];
  readonly roles: readonly string[];
  readonly persona: PlatformContextV1['persona_type'];
  /** Server-resolved WI-OI-109 scope used with the module's own organization replica. */
  readonly organization?: OrganizationClaim;
  readonly departmentScope: ModuleDepartmentScope;
  readonly placeScope: ModulePlaceScope;
}

export interface ModuleCommandContext {
  readonly principal: ModulePrincipal;
  readonly correlationId: string;
}

export interface SignedContextGuardOptions {
  /** Used in refusal messages, for example "Inspections". */
  readonly label: string;
  /** Catalogue key the signed entitlement must name. */
  readonly moduleKey: string;
  /** Shown when the entitlement is not active, for example "Inspections & Safety". */
  readonly entitlementName: string;
  /** `<prefix>:*` grants every `<prefix>.<area>.<action>` permission. */
  readonly permissionPrefix: string;
  /** Ed25519 public key (PEM) of the web BFF's signing key for this module. */
  readonly publicKey: string;
  /** Audience the BFF signs this module's contexts for. */
  readonly audience: string;
}

interface SignedRequest {
  headers: Record<string, string | string[] | undefined>;
  modulePrincipal?: ModulePrincipal;
}

/** The permissions a route needs; the handler's list overrides the controller's. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ModulePrincipal => {
    const request = context.switchToHttp().getRequest<SignedRequest>();
    if (!request.modulePrincipal) throw new UnauthorizedException('Request is unauthenticated.');
    return request.modulePrincipal;
  },
);

/** The verified principal plus a correlation id taken from `X-Correlation-Id` when well-formed. */
export const CommandContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ModuleCommandContext => {
    const request = context.switchToHttp().getRequest<SignedRequest>();
    if (!request.modulePrincipal) throw new UnauthorizedException('Request is unauthenticated.');
    return {
      principal: request.modulePrincipal,
      correlationId: correlationIdFrom(request.headers['x-correlation-id']),
    };
  },
);

/**
 * Tenant authority comes only from a PlatformContextV1 signed by the web BFF with this module's key and audience,
 * carrying this module's active entitlement. Caller-supplied tenant or user values are never read; the verified
 * permissions decide each route, and revoked sessions are refused. Modules keep a thin @Injectable subclass that
 * supplies the options and their database.
 */
export class SignedContextGuardBase implements CanActivate {
  constructor(
    private readonly guardOptions: SignedContextGuardOptions,
    private readonly revocations: Pick<ModuleDatabase, 'isContextRevoked'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SignedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    let platformContext: PlatformContextV1;
    try {
      platformContext = verifyPlatformContextToken(
        token,
        this.guardOptions.publicKey,
        this.guardOptions.audience,
      );
    } catch (error) {
      if (error instanceof PlatformContextError)
        throw new UnauthorizedException('Platform context token is invalid or expired.');
      throw new UnauthorizedException('Platform context verification failed.');
    }

    if (
      platformContext.entitlement.status !== 'ENABLED' ||
      platformContext.entitlement.module_key !== this.guardOptions.moduleKey
    ) {
      throw new ForbiddenException(
        `The ${this.guardOptions.entitlementName} entitlement is not active.`,
      );
    }
    if (!TENANT_ID_PATTERN.test(platformContext.tenant_id))
      throw new UnauthorizedException('Platform context contains an invalid tenant identifier.');

    for (const permission of requiredPermissions(context)) {
      if (!hasModulePermission(platformContext.granted_scopes, permission, this.guardOptions.permissionPrefix))
        throw new ForbiddenException(`Missing required permission: ${permission}`);
    }

    try {
      const revoked = await this.revocations.isContextRevoked({
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

    request.modulePrincipal = principalFromContext(platformContext);
    return true;
  }
}

export function principalFromContext(context: PlatformContextV1): ModulePrincipal {
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
  if (typeof header !== 'string')
    throw new UnauthorizedException('Authorization header is missing or malformed.');
  const match = /^Bearer\s+([^\s]+)$/.exec(header.trim());
  if (!match?.[1]) throw new UnauthorizedException('Authorization header must use the Bearer scheme.');
  return match[1];
}

/** `*`, `<prefix>:*` or the exact permission. */
export function hasModulePermission(
  granted: readonly string[],
  required: string,
  prefix: string,
): boolean {
  return granted.includes('*') || granted.includes(`${prefix}:*`) || granted.includes(required);
}

function correlationIdFrom(header: string | string[] | undefined): string {
  const candidate = typeof header === 'string' ? header.trim() : '';
  return CORRELATION_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

type MetadataReader = (key: string, target: object) => unknown;

function requiredPermissions(context: ExecutionContext): readonly string[] {
  const read = (Reflect as unknown as { getMetadata?: MetadataReader }).getMetadata;
  if (typeof read !== 'function')
    throw new ServiceUnavailableException('Route permissions cannot be read; reflect-metadata is not loaded.');
  const handler = context.getHandler?.();
  const controller = context.getClass?.();
  const value =
    (handler ? read.call(Reflect, PERMISSIONS_METADATA, handler) : undefined) ??
    (controller ? read.call(Reflect, PERMISSIONS_METADATA, controller) : undefined);
  return Array.isArray(value) ? value : [];
}
