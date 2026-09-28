import { ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import { PlatformContextGuard } from './platform-context.guard.js';
import {
  REQUIRED_MODULE_KEY,
  REQUIRED_SCOPES_KEY,
} from '../decorators/require-scopes.decorator.js';

const { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const AUDIENCE = 'gigalibs-cmms-api';

function createValidPayload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: AUDIENCE,
    sub: '00000000-0000-0000-0000-000000000002',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000003',
    auth_version: 1,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['cmms:read', 'cmms:write'],
    persona_type: 'TENANT_ADMIN',
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

describe('PlatformContextGuard', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_CONTEXT_PUBLIC_KEY', PUBLIC_KEY);
    vi.stubEnv('MODULE_AUDIENCE', AUDIENCE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects request with missing Authorization header', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const { context } = executionContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects request with malformed or non-Bearer Authorization header', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const { context } = executionContext({ headers: { authorization: 'Basic 12345' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the Ed25519 verification key is missing', async () => {
    vi.stubEnv('PLATFORM_CONTEXT_PUBLIC_KEY', '');
    const guard = new PlatformContextGuard(new Reflector());
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context } = executionContext({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'PLATFORM_CONTEXT_PUBLIC_KEY must contain an Ed25519 public PEM key.',
    );
  });

  it('rejects invalid or expired token', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const { context } = executionContext({
      headers: { authorization: 'Bearer invalid.token.signature' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects token when required module does not match entitlement', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const payload = createValidPayload({
      entitlement: { module_key: 'finance-ap', status: 'ENABLED', version: 'v1' },
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context, handler } = executionContext({
      headers: { authorization: `Bearer ${token}` },
    });
    Reflect.defineMetadata(REQUIRED_MODULE_KEY, 'asset-maintenance', handler);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when token is missing required scopes', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const payload = createValidPayload({
      granted_scopes: ['cmms:read'],
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const { context, handler } = executionContext({
      headers: { authorization: `Bearer ${token}` },
    });
    Reflect.defineMetadata(REQUIRED_SCOPES_KEY, ['cmms:read', 'cmms:write'], handler);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authenticates valid token, validates scopes, and populates request context', async () => {
    const guard = new PlatformContextGuard(new Reflector());
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const { context, handler } = executionContext(request);
    Reflect.defineMetadata(REQUIRED_SCOPES_KEY, ['cmms:read'], handler);
    Reflect.defineMetadata(REQUIRED_MODULE_KEY, 'asset-maintenance', handler);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.platformContext.sub).toBe(payload.sub);
    expect(request.tenant.tenantId).toBe(payload.tenant_id);
    expect(request.user.sub).toBe(payload.sub);
    expect(request.user.permissions).toContain('cmms:read');
    expect(request.principal.persona).toBe('TENANT_ADMIN');
    expect(request.principal.orgScope.mode).toBe('FLAT_TENANT');
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
