import { generateKeyPairSync } from 'node:crypto';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeospatialAuthorizationGuard, RequirePermissions, extractBearerToken } from './authorization.js';
import type { GeospatialDatabaseService } from '../database/database.service.js';
import type { GeospatialRuntimeConfig } from '../runtime-config.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config: GeospatialRuntimeConfig = {
  nodeEnv: 'test',
  apiHost: '127.0.0.1',
  apiPort: 4720,
  corsOrigins: ['http://localhost:5180'],
  databaseUrl: 'postgresql://runtime:secret@localhost:5440/gigalibs',
  databasePoolSize: 2,
  expectedMigrationVersion: 3,
  platformContextPublicKey: publicKey,
  platformContextAudience: 'gigalibs-geospatial-api',
};

function payload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-geospatial-api',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['MEMBER'],
    granted_scopes: ['maps:read'],
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'geospatial-studio', status: 'ENABLED', version: 'v1' },
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

describe('Geospatial signed context guard', () => {
  let database: { isContextRevoked: ReturnType<typeof vi.fn> };
  let guard: GeospatialAuthorizationGuard;

  beforeEach(() => {
    database = { isContextRevoked: vi.fn().mockResolvedValue(false) };
    guard = new GeospatialAuthorizationGuard(
      config,
      new Reflector(),
      database as unknown as GeospatialDatabaseService,
    );
  });

  it('rejects missing and malformed bearer values', () => {
    expect(() => extractBearerToken(undefined)).toThrow(UnauthorizedException);
    expect(() => extractBearerToken('Basic abc')).toThrow(UnauthorizedException);
  });

  it('never accepts caller tenant or user headers as authority', async () => {
    await expect(
      guard.canActivate(
        executionContext({ headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(database.isContextRevoked).not.toHaveBeenCalled();
  });

  it('rejects an unsigned JWT-shaped value', async () => {
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
      Buffer.from(JSON.stringify(payload())).toString('base64url'),
      'forged',
    ].join('.');
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${unsigned}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects the wrong audience and entitlement', async () => {
    const wrongAudience = signPlatformContextToken(payload({ aud: 'gigalibs-workforce-api' }), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${wrongAudience}` } })),
    ).rejects.toThrow(UnauthorizedException);

    const wrongEntitlement = signPlatformContextToken(
      payload({ entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' } }),
      privateKey,
    );
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${wrongEntitlement}` } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires endpoint permissions', async () => {
    class TestController {
      @RequirePermissions('maps.nodes.manage')
      endpoint() {}
    }
    const handler = Object.getOwnPropertyDescriptor(TestController.prototype, 'endpoint')!.value;
    const token = signPlatformContextToken(payload(), privateKey);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } }, handler)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a revoked session and fails closed when revocation cannot be checked', async () => {
    const token = signPlatformContextToken(payload(), privateKey);
    database.isContextRevoked.mockResolvedValueOnce(true);
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow('has been revoked');
    database.isContextRevoked.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      guard.canActivate(executionContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('accepts a valid signed, entitled, non-revoked context and attaches immutable authority', async () => {
    const request = {
      headers: { authorization: `Bearer ${signPlatformContextToken(payload(), privateKey)}` },
    } as { headers: Record<string, string>; principal?: { tenantId: string; permissions: readonly string[] } };
    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(request.principal).toMatchObject({ tenantId: 'tenant-1', permissions: ['maps:read'] });
    expect(Object.isFrozen(request.principal)).toBe(true);
  });

  it('carries the signed spatial scope and treats tokens without one as unbounded', async () => {
    const placeId = '00000000-0000-4000-8000-000000000001';
    const scoped = {
      headers: {
        authorization: `Bearer ${signPlatformContextToken(
          payload({ spatial_scope: { mode: 'SCOPED_PLACES', place_ids: [placeId] } }),
          privateKey,
        )}`,
      },
    } as { headers: Record<string, string>; principal?: { spatialScope: unknown } };
    await expect(guard.canActivate(executionContext(scoped))).resolves.toBe(true);
    expect(scoped.principal?.spatialScope).toEqual({ mode: 'SCOPED_PLACES', place_ids: [placeId] });
    expect(Object.isFrozen(scoped.principal?.spatialScope)).toBe(true);

    const legacy = {
      headers: { authorization: `Bearer ${signPlatformContextToken(payload(), privateKey)}` },
    } as { headers: Record<string, string>; principal?: { spatialScope: unknown } };
    await expect(guard.canActivate(executionContext(legacy))).resolves.toBe(true);
    expect(legacy.principal?.spatialScope).toEqual({ mode: 'UNBOUNDED' });
  });
});
