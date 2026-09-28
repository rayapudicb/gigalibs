import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import {
  verifyPlatformContextToken,
  PlatformContextError,
} from '@gigalibs/auth-core';
import {
  REQUIRED_AUDIENCE_KEY,
  REQUIRED_MODULE_KEY,
  REQUIRED_SCOPES_KEY,
} from '../decorators/require-scopes.decorator.js';

export const PLATFORM_CONTEXT_GUARD_OPTIONS = 'PLATFORM_CONTEXT_GUARD_OPTIONS';

export interface PlatformContextGuardOptions {
  publicKey?: string;
  defaultAudience?: string;
  defaultModuleKey?: string;
}

@Injectable()
export class PlatformContextGuard implements CanActivate {
  private readonly configuredPublicKey: string | undefined;
  private readonly defaultAudience: string | undefined;
  private readonly defaultModuleKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(PLATFORM_CONTEXT_GUARD_OPTIONS)
    options?: PlatformContextGuardOptions,
  ) {
    this.configuredPublicKey = options?.publicKey;
    this.defaultAudience = options?.defaultAudience;
    this.defaultModuleKey = options?.defaultModuleKey;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Missing platform context bearer token');
    }

    const publicKey =
      this.configuredPublicKey ??
      process.env.PLATFORM_CONTEXT_PUBLIC_KEY;

    if (!publicKey?.trim()) {
      throw new Error(
        'PLATFORM_CONTEXT_PUBLIC_KEY must contain an Ed25519 public PEM key.',
      );
    }

    const requiredAudience =
      this.reflector.getAllAndOverride<string | undefined>(REQUIRED_AUDIENCE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ??
      this.defaultAudience ??
      process.env.MODULE_AUDIENCE;

    if (!requiredAudience) {
      throw new Error('No target audience configured for PlatformContextGuard verification.');
    }

    let payload: PlatformContextV1;
    try {
      payload = verifyPlatformContextToken(token, publicKey, requiredAudience);
    } catch (error) {
      if (error instanceof PlatformContextError) {
        throw new UnauthorizedException(`Platform context verification failed: ${error.message}`);
      }
      throw new UnauthorizedException('Platform context token is invalid or expired');
    }

    // Verify Entitlement
    if (payload.entitlement.status !== 'ENABLED') {
      throw new ForbiddenException(
        `Module '${payload.entitlement.module_key}' is not active or entitled for this tenant.`,
      );
    }

    const requiredModule =
      this.reflector.getAllAndOverride<string | undefined>(REQUIRED_MODULE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaultModuleKey;

    if (requiredModule && payload.entitlement.module_key !== requiredModule) {
      throw new ForbiddenException(
        `Platform context token is for module '${payload.entitlement.module_key}', but endpoint requires '${requiredModule}'.`,
      );
    }

    // Verify Scopes / Permissions
    const requiredScopes =
      this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const scope of requiredScopes) {
      if (!payload.granted_scopes.includes(scope)) {
        throw new ForbiddenException(`Missing required scope: ${scope}`);
      }
    }

    // Attach verified context to request
    request.platformContext = payload;
    request.tenant = { tenantId: payload.tenant_id };
    request.user = {
      sub: payload.sub,
      tid: payload.tenant_id,
      roles: payload.roles,
      permissions: payload.granted_scopes,
    };
    request.principal = {
      tenantId: payload.tenant_id,
      subject: payload.sub,
      issuer: payload.iss,
      permissions: payload.granted_scopes,
      persona: payload.persona_type,
      orgScope: payload.org_scope,
      entitlement: payload.entitlement,
    };

    return true;
  }
}
