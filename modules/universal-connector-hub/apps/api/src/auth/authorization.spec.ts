import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { ConnectorsController } from '../connectors/connectors.controller.js';
import { SyncController } from '../sync/sync.controller.js';
import { ConnectorHubAuthorizationGuard } from './authorization.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'der' },
});

function payload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-connector-hub-api',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 1,
    roles: ['MANAGER'],
    granted_scopes: ['connections:read', 'connections:test'],
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'connections', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 300,
    jti: 'jti-1',
    ...overrides,
  } as PlatformContextV1;
}

// WI-OI-104a: Connector Hub trusts only a BFF-signed context and checks every route's permission.
describe('Connector Hub authorization', () => {
  let guard: ConnectorHubAuthorizationGuard;
  const database = { isContextRevoked: vi.fn().mockResolvedValue(false) };

  beforeAll(() => {
    Object.assign(process.env, {
      CONNECTOR_HUB_API_HOST: '0.0.0.0',
      CONNECTOR_HUB_API_PORT: '4100',
      CONNECTOR_HUB_CORS_ORIGINS: 'http://127.0.0.1:5180',
      CONNECTORS_DATABASE_URL: 'postgresql://connectors_runtime:secret@localhost:5440/gigalibs',
      CONNECTOR_HUB_DATABASE_POOL_SIZE: '5',
      CONNECTOR_VAULT_KEY: 'local-test-key-that-is-at-least-32-bytes-long',
      CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION: '5',
      CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS: 'example.com',
      CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND: 'false',
      CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKey.toString('base64'),
    });
    guard = new ConnectorHubAuthorizationGuard(database as unknown as DatabaseService);
  });

  const request = (token?: string, extra: Record<string, string> = {}) => ({
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
  }) as { headers: Record<string, string>; modulePrincipal?: { tenantId: string } };
  const context = (req: unknown, handler: (...args: never[]) => unknown, controller: object) =>
    ({ switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => controller }) as never;
  const read = ConnectorsController.prototype.listConnections;
  const create = ConnectorsController.prototype.createConnection;
  const sync = SyncController.prototype.triggerSync;

  it('refuses a missing, foreign or wrong-audience context, and a context for another entitlement', async () => {
    await expect(guard.canActivate(context(request(), read, ConnectorsController))).rejects.toBeInstanceOf(UnauthorizedException);
    const other = generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    for (const token of [
      signPlatformContextToken(payload(), other.privateKey),
      signPlatformContextToken(payload({ aud: 'gigalibs-analytics-api' }), privateKey),
    ]) {
      await expect(guard.canActivate(context(request(token), read, ConnectorsController))).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const wrongModule = signPlatformContextToken(
      payload({ entitlement: { module_key: 'analytics-studio', status: 'ENABLED', version: 'v1' } } as never),
      privateKey,
    );
    await expect(guard.canActivate(context(request(wrongModule), read, ConnectorsController))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('takes the tenant from the signed context, never from an X-Tenant-Id header', async () => {
    const req = request(signPlatformContextToken(payload(), privateKey), { 'x-tenant-id': 'tenant-attacker' });
    await expect(guard.canActivate(context(req, read, ConnectorsController))).resolves.toBe(true);
    expect(req.modulePrincipal?.tenantId).toBe('tenant-1');
  });

  it('checks each route: a manager may read and test but not create or sync; connections:* may do all', async () => {
    const manager = signPlatformContextToken(payload(), privateKey);
    await expect(guard.canActivate(context(request(manager), create, ConnectorsController))).rejects.toThrow('connections:write');
    await expect(guard.canActivate(context(request(manager), sync, SyncController))).rejects.toThrow('connections:sync');
    const admin = signPlatformContextToken(payload({ granted_scopes: ['connections:*'] }), privateKey);
    await expect(guard.canActivate(context(request(admin), create, ConnectorsController))).resolves.toBe(true);
    await expect(guard.canActivate(context(request(admin), sync, SyncController))).resolves.toBe(true);
  });

  it('refuses a revoked session', async () => {
    database.isContextRevoked.mockResolvedValueOnce(true);
    await expect(guard.canActivate(context(request(signPlatformContextToken(payload(), privateKey)), read, ConnectorsController))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('guards every user route with exactly the agreed permission', () => {
    const routes: Record<string, string> = {};
    for (const controller of [ConnectorsController, SyncController]) {
      expect((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]).includes(ConnectorHubAuthorizationGuard)).toBe(true);
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as unknown as Record<string, object>)[name]!;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (name === 'constructor' || path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        routes[`${method} ${base}/${path}`] = (Reflect.getMetadata('gigalibs.module-sdk.required-permissions', handler) as string[] | undefined)?.join(',') ?? '(none)';
      }
    }
    expect(routes).toEqual({
      'GET api/connectors/v1/catalog': 'connections:read',
      'GET api/connectors/v1/connections': 'connections:read',
      'GET api/connectors/v1/connections/:idOrSlug': 'connections:read',
      'POST api/connectors/v1/connections': 'connections:write',
      'POST api/connectors/v1/connections/:id/test': 'connections:test',
      'POST api/connectors/v1/oauth/initiate': 'connections:write',
      'POST api/connectors/v1/connections/:id/oauth/callback': 'connections:write',
      'GET api/connectors/v1/journal': 'connections:read',
      'POST api/connectors/v1/connections/:id/sync': 'connections:sync',
      'GET api/connectors/v1/stats': 'connections:read',
    });
  });
});
