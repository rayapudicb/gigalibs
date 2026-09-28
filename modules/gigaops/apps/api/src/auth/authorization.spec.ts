import { generateKeyPairSync } from 'node:crypto';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GigaOpsAuthorizationGuard,
  RequireAnyPermission,
  RequirePermissions,
  RequireRoles,
  extractBearerToken,
} from './authorization.js';
import type { WorkforceDatabaseService } from '../database/database.service.js';
import type { GigaOpsRuntimeConfig } from '../runtime-config.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config: GigaOpsRuntimeConfig = {
  nodeEnv: 'test',
  apiHost: '127.0.0.1',
  apiPort: 4700,
  corsOrigins: ['http://localhost:5180'],
  databaseUrl: 'postgresql://runtime:secret@localhost:5440/gigalibs',
  databasePoolSize: 2,
  expectedMigrationVersion: 4,
  platformContextPublicKey: publicKey,
  platformContextAudience: 'gigalibs-workforce-api',
};

function payload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-workforce-api',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['MEMBER'],
    granted_scopes: ['workforce:read'],
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 300,
    jti: 'jti-1',
    ...overrides,
  };
}

function executionContext(request: { headers: Record<string, string> }, handler = () => undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as never;
}

describe('GigaOps Workforce signed context guard', () => {
  let database: { isContextRevoked: ReturnType<typeof vi.fn> };
  let guard: GigaOpsAuthorizationGuard;

  beforeEach(() => {
    database = { isContextRevoked: vi.fn().mockResolvedValue(false) };
    guard = new GigaOpsAuthorizationGuard(
      config,
      new Reflector(),
      database as unknown as WorkforceDatabaseService,
    );
  });

  it('rejects missing and malformed bearer values', () => {
    expect(() => extractBearerToken(undefined)).toThrow(UnauthorizedException);
    expect(() => extractBearerToken('Basic abc')).toThrow(UnauthorizedException);
  });

  it('rejects an unsigned JWT-shaped value without an OIDC fallback', async () => {
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
      Buffer.from(JSON.stringify(payload())).toString('base64url'),
      'forged',
    ].join('.');
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${unsigned}` } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(database.isContextRevoked).not.toHaveBeenCalled();
  });

  it('rejects the wrong audience and entitlement', async () => {
    const wrongAudience = signPlatformContextToken(payload({ aud: 'gigalibs-cmms-api' }), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${wrongAudience}` } })),
    ).rejects.toThrow(UnauthorizedException);

    const wrongEntitlement = signPlatformContextToken(
      payload({ entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' } }),
      privateKey,
    );
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${wrongEntitlement}` } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires endpoint permissions and does not substitute a role', async () => {
    class TestController {
      @RequirePermissions('workforce.resources.manage')
      endpoint() {}
    }
    const handler = Object.getOwnPropertyDescriptor(TestController.prototype, 'endpoint')!.value;
    const token = signPlatformContextToken(payload(), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } }, handler)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('admits a route that needs any one of several permissions only when the caller holds one (WI-OI-069)', async () => {
    class TestController {
      @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
      endpoint() {}
    }
    const handler = Object.getOwnPropertyDescriptor(TestController.prototype, 'endpoint')!.value;
    const worker = signPlatformContextToken(payload({ granted_scopes: ['workforce.time.punch'] }), privateKey);
    await expect(guard.canActivate(executionContext({ headers: { authorization: `Bearer ${worker}` } }, handler))).resolves.toBe(true);
    const manager = signPlatformContextToken(payload({ granted_scopes: ['workforce.time.read'] }), privateKey);
    await expect(guard.canActivate(executionContext({ headers: { authorization: `Bearer ${manager}` } }, handler))).resolves.toBe(true);
    const neither = signPlatformContextToken(payload({ granted_scopes: ['workforce.bookings.read'] }), privateKey);
    await expect(guard.canActivate(executionContext({ headers: { authorization: `Bearer ${neither}` } }, handler))).rejects.toThrow(ForbiddenException);
  });

  it('contains prototype role-decorated endpoints even when the role string is present', async () => {
    class TestController {
      @RequireRoles('workforce_manager')
      endpoint() {}
    }
    const handler = Object.getOwnPropertyDescriptor(TestController.prototype, 'endpoint')!.value;
    const token = signPlatformContextToken(
      payload({ roles: ['workforce_manager'], granted_scopes: ['workforce:*'] }),
      privateKey,
    );
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } }, handler)),
    ).rejects.toThrow('prototype role-based route is contained');
  });

  it('rejects a server-side revoked session', async () => {
    database.isContextRevoked.mockResolvedValue(true);
    const token = signPlatformContextToken(payload(), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow('has been revoked');
  });

  it('fails closed when revocation state cannot be checked', async () => {
    database.isContextRevoked.mockRejectedValue(new Error('database unavailable'));
    const token = signPlatformContextToken(payload(), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('accepts a valid signed, entitled, non-revoked context and attaches immutable authority', async () => {
    const request = { headers: { authorization: `Bearer ${signPlatformContextToken(payload(), privateKey)}` } } as {
      headers: Record<string, string>;
      principal?: { tenantId: string; permissions: readonly string[] };
    };
    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(database.isContextRevoked).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      subject: 'user-1',
      sessionId: 'session-1',
      authVersion: 3,
    });
    expect(request.principal).toMatchObject({
      tenantId: 'tenant-1',
      permissions: ['workforce:read'],
    });
    expect(Object.isFrozen(request.principal)).toBe(true);
  });
});
