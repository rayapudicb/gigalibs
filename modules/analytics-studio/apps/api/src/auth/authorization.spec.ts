import { generateKeyPairSync } from 'node:crypto';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { AnalyticsRuntimeConfig } from '../runtime-config.js';
import { PlatformContextAuthorizationGuard, RequirePermissions, type AuthenticatedRequest } from './authorization.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const other = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config = {
  platformContextPublicKey: publicKey,
  platformContextAudience: 'gigalibs-analytics-api',
} as AnalyticsRuntimeConfig;

function payload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-analytics-api',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['MEMBER'],
    granted_scopes: ['analytics:read'],
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'analytics-studio', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 300,
    jti: 'jti-1',
    ...overrides,
  };
}

class ReadController {
  @RequirePermissions('analytics:read')
  read() {}
  @RequirePermissions('analytics:connectors:write')
  write() {}
}

function context(request: AuthenticatedRequest, handler: 'read' | 'write' = 'read') {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ReadController.prototype[handler],
    getClass: () => ReadController,
  } as never;
}

const bearer = (token: string): AuthenticatedRequest => ({ headers: { authorization: `Bearer ${token}` } });

// WI-OI-064a: Analytics trusts only the BFF-signed platform context, never a self-issued development token.
describe('Analytics signed platform-context guard', () => {
  let database: { isContextRevoked: ReturnType<typeof vi.fn> };
  let guard: PlatformContextAuthorizationGuard;

  beforeEach(() => {
    database = { isContextRevoked: vi.fn().mockResolvedValue(false) };
    guard = new PlatformContextAuthorizationGuard(config, new Reflector(), database as unknown as DatabaseService);
  });

  it('refuses a missing, malformed, tampered, foreign-key or wrong-audience token', async () => {
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context({ headers: { authorization: 'Basic abc' } }))).rejects.toThrow(UnauthorizedException);
    const valid = signPlatformContextToken(payload(), privateKey);
    const tampered = `${valid.split('.')[0]}.${Buffer.from(JSON.stringify(payload({ tenant_id: 'tenant-2' }))).toString('base64url')}.${valid.split('.')[2]}`;
    for (const token of [
      tampered,
      signPlatformContextToken(payload(), other.privateKey),
      signPlatformContextToken(payload({ aud: 'gigalibs-geospatial-api' }), privateKey),
      signPlatformContextToken(payload({ exp: Math.floor(Date.now() / 1000) - 1 }), privateKey),
    ]) {
      await expect(guard.canActivate(context(bearer(token)))).rejects.toThrow(UnauthorizedException);
    }
    expect(database.isContextRevoked).not.toHaveBeenCalled();
  });

  it('refuses a context for another module', async () => {
    const token = signPlatformContextToken(
      payload({ entitlement: { module_key: 'geospatial-studio', status: 'ENABLED', version: 'v1' } }),
      privateKey,
    );
    await expect(guard.canActivate(context(bearer(token)))).rejects.toThrow(ForbiddenException);
  });

  it("checks each endpoint against the user's real scopes, with analytics:* covering granular permissions", async () => {
    const reader = signPlatformContextToken(payload(), privateKey);
    await expect(guard.canActivate(context(bearer(reader), 'write'))).rejects.toThrow('analytics:connectors:write');
    const admin = signPlatformContextToken(payload({ granted_scopes: ['analytics:*'] }), privateKey);
    await expect(guard.canActivate(context(bearer(admin), 'write'))).resolves.toBe(true);
  });

  it('refuses a revoked session and fails closed when revocation cannot be checked', async () => {
    const token = signPlatformContextToken(payload(), privateKey);
    database.isContextRevoked.mockResolvedValueOnce(true);
    await expect(guard.canActivate(context(bearer(token)))).rejects.toThrow('has been revoked');
    database.isContextRevoked.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(guard.canActivate(context(bearer(token)))).rejects.toThrow(ServiceUnavailableException);
    expect(database.isContextRevoked).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1',
      subject: 'user-1',
      sessionId: 'session-1',
      authVersion: 3,
    });
  });

  it('attaches an immutable principal carrying the signed scopes and spatial scope', async () => {
    const placeId = '00000000-0000-4000-8000-000000000001';
    const request = bearer(
      signPlatformContextToken(payload({ spatial_scope: { mode: 'SCOPED_PLACES', place_ids: [placeId] } }), privateKey),
    );
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.analyticsPrincipal).toMatchObject({
      tenantId: 'tenant-1',
      subject: 'user-1',
      permissions: ['analytics:read'],
      spatialScope: { mode: 'SCOPED_PLACES', place_ids: [placeId] },
    });
    expect(Object.isFrozen(request.analyticsPrincipal)).toBe(true);

    const legacy = bearer(signPlatformContextToken(payload(), privateKey));
    await guard.canActivate(context(legacy));
    expect(legacy.analyticsPrincipal?.spatialScope).toEqual({ mode: 'UNBOUNDED' });
  });
});
