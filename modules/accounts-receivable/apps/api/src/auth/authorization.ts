import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import { holdsPermission } from '@gigalibs/contracts';
import {
  type ModuleRuntimeConfig,
  SignedContextGuardBase,
  type ModulePrincipal,
} from '@gigalibs/module-sdk';
import {
  AR_MODULE_RUNTIME_CONFIG,
  AR_PLATFORM_CONTEXT_ISSUER,
  MODULE_KEY,
  PERMISSION_PREFIX,
} from '../config.module-sdk.js';
import { AR_CONFIG } from '../config.provider.js';
import type { ArRuntimeConfig } from '../runtime-config.js';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSION_PATTERN = /^[a-z][a-z0-9._:-]{1,99}$/;
const PERMISSIONS_METADATA = 'ar.required-permissions';

export interface ArPrincipal {
  tenantId: string;
  subject: string;
  issuer: string;
  permissions: readonly string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: ArPrincipal;
  modulePrincipal?: ModulePrincipal;
  correlationId?: string;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

@Injectable()
export class OidcAuthorizationGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(AR_CONFIG) private readonly config: ArRuntimeConfig,
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
    } catch {
      throw new UnauthorizedException('Access token is missing, invalid, or expired.');
    }

    const tenantId = payload[this.config.tenantClaim];
    const rawPermissions = payload[this.config.permissionsClaim];
    if (
      typeof tenantId !== 'string' ||
      !UUID_PATTERN.test(tenantId) ||
      typeof payload.sub !== 'string' ||
      payload.sub.length < 1 ||
      payload.sub.length > 255 ||
      !Array.isArray(rawPermissions) ||
      rawPermissions.length > 256 ||
      rawPermissions.some(
        (permission) => typeof permission !== 'string' || !PERMISSION_PATTERN.test(permission),
      )
    ) {
      throw new UnauthorizedException('Access token claims are invalid.');
    }

    const permissions = [...new Set(rawPermissions as string[])].sort();
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    // The one permission rule (WI-OI-120q): `*`, the exact code, or its family's wildcard, as the web decides.
    if (required.some((permission) => !holdsPermission(permissions, permission))) {
      throw new ForbiddenException('The caller lacks a required AR permission.');
    }

    request.principal = {
      tenantId: tenantId.toLowerCase(),
      subject: payload.sub,
      issuer: this.config.oidcIssuer,
      permissions,
    };
    return true;
  }
}

function extractBearerToken(value: string | string[] | undefined): string {
  if (typeof value !== 'string') {
    throw new UnauthorizedException('Bearer access token is required.');
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value);
  if (!match?.[1] || match[1].length > 16_384) {
    throw new UnauthorizedException('Bearer access token is malformed.');
  }
  return match[1];
}

function arPrincipalFromModule(modulePrincipal: ModulePrincipal): ArPrincipal {
  return {
    tenantId: modulePrincipal.tenantId,
    subject: modulePrincipal.subject,
    issuer: AR_PLATFORM_CONTEXT_ISSUER,
    permissions: modulePrincipal.permissions,
  };
}

@Injectable()
export class PlatformArAuthorizationGuard extends SignedContextGuardBase {
  constructor(config: ModuleRuntimeConfig, database: DatabaseService) {
    super(
      {
        label: 'Accounts Receivable',
        moduleKey: MODULE_KEY,
        entitlementName: 'Accounts Receivable',
        permissionPrefix: PERMISSION_PREFIX,
        publicKey: config.platformContextPublicKey,
        audience: config.platformContextAudience,
      },
      database,
    );
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ok = await super.canActivate(context);
    if (request.modulePrincipal) request.principal = arPrincipalFromModule(request.modulePrincipal);
    return ok;
  }
}

/** Accepts suite platform context when configured; otherwise falls back to OIDC (compose dev issuer). */
@Injectable()
export class ArAuthorizationGuard implements CanActivate {
  constructor(
    private readonly oidc: OidcAuthorizationGuard,
    @Inject(AR_MODULE_RUNTIME_CONFIG) private readonly platformConfig: ModuleRuntimeConfig | null,
    @Optional() private readonly platform: PlatformArAuthorizationGuard | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.platformConfig || !this.platform) return this.oidc.canActivate(context);
    try {
      return await this.platform.canActivate(context);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException
      ) {
        return this.oidc.canActivate(context);
      }
      throw error;
    }
  }
}

