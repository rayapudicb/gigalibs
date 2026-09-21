import { ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import { OidcAuthorizationGuard } from './authorization.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';

const { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const AUDIENCE = 'gigalibs-cmms-api';

function createMockConfig(): CmmsRuntimeConfig {
  return {
    nodeEnv: 'test',
    allowInsecureOidc: true,
    apiHost: '127.0.0.1',
    apiPort: 4000,
    corsOrigins: ['*'],
    databaseUrl: 'postgresql://test:test@127.0.0.1:5432/test',
    databasePoolSize: 5,
    platformContextPublicKey: PUBLIC_KEY,
    oidcIssuer: 'https://issuer.example.invalid',
    oidcAudience: AUDIENCE,
    oidcJwksUri: 'https://issuer.example.invalid/.well-known/jwks.json',
    oidcAlgorithms: ['RS256'],
    tenantClaim: 'tenant_id',
    permissionsClaim: 'permissions',
  };
}

function createValidPayload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: AUDIENCE,
    sub: '00000000-0000-0000-0000-000000000002',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000003',
    auth_version: 1,
    roles: ['MEMBER'],
    granted_scopes: ['cmms:read', 'cmms:write'],
    persona_type: 'WORKFORCE_MEMBER',
    org_scope: {
      mode: 'FLAT_TENANT',
    },
    entitlement: {
      module_key: 'asset-maintenance',
      status: 'ENABLED',
      version: 'v1',
    },
    iat: now,
    exp: now + 300,
    jti: '00000000-0000-0000-0000-000000000004',
    ...overrides,
  };
}

beforeAll(() => {
  installMetadataShim();
});

describe('OidcAuthorizationGuard with PlatformContextV1', () => {
  it('rejects missing Authorization header', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const { context } = executionContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects non-Bearer Authorization header', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const { context } = executionContext({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired PlatformContextV1 token', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const now = Math.floor(Date.now() / 1000);
    const payload = createValidPayload({ iat: now - 600, exp: now - 10 });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context } = executionContext({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects PlatformContextV1 token with wrong audience', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const payload = createValidPayload({ aud: 'different-audience' });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context } = executionContext({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects PlatformContextV1 token if required permission is not in granted_scopes', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const payload = createValidPayload({ granted_scopes: ['cmms:read'] });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context, handler } = executionContext({ headers: { authorization: `Bearer ${token}` } });
    Reflect.defineMetadata('cmms.required-permissions', ['cmms:write'], handler);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('successfully authenticates valid PlatformContextV1 and populates request.principal', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const { context, handler } = executionContext(request);
    Reflect.defineMetadata('cmms.required-permissions', ['cmms:read'], handler);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.principal.tenantId).toBe(payload.tenant_id);
    expect(request.principal.subject).toBe(payload.sub);
    expect(request.principal.issuer).toBe('gigalibs-control-plane');
    expect(request.principal.persona).toBe('WORKFORCE_MEMBER');
    expect(request.principal.permissions).toContain('cmms:read');
    expect(request.principal.departmentScope.mode).toBe('FLAT_TENANT');
  });
  it('populates departmentIds on principal when org_scope.mode is SCOPED_DEPARTMENTS', async () => {
    const guard = new OidcAuthorizationGuard(createMockConfig(), new Reflector());
    const payload = createValidPayload({
      org_scope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['dept-001', 'dept-002', 'dept-003'] },
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const { context } = executionContext(request);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.principal.departmentScope.mode).toBe('SCOPED_DEPARTMENTS');
    expect(request.principal.departmentScope.departmentIds).toEqual(['dept-001', 'dept-002', 'dept-003']);
  });
});

function executionContext(request: object): { context: ExecutionContext; handler: () => void } {
  const handler = () => undefined;
  class Controller {}
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, handler };
}

type MetadataReflect = typeof Reflect & {
  defineMetadata: (key: string, value: unknown, target: object) => void;
  getMetadata: (key: string, target: object) => unknown;
};

function installMetadataShim(): void {
  const metadata = new WeakMap<object, Map<string, unknown>>();
  const reflection = Reflect as MetadataReflect;
  reflection.defineMetadata = (key, value, target) => {
    const values = metadata.get(target) ?? new Map<string, unknown>();
    values.set(key, value);
    metadata.set(target, values);
  };
  reflection.getMetadata = (key, target) => metadata.get(target)?.get(key);
}
