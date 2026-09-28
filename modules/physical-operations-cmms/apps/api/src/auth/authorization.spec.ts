/**
 * WI-OI-038 — CMMS trusts only the BFF-signed PlatformContextV1 for its own audience and entitlement, checks
 * the user's verified scopes and session revocation, and derives department and place scope from the token.
 */
import { generateKeyPairSync } from 'node:crypto';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { describe, expect, it, vi } from 'vitest';
import { CmmsAuthorizationGuard, hasCmmsPermission } from './authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';

const signer = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const stranger = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config = {
  platformContextPublicKey: signer.publicKey,
  platformContextAudience: 'gigalibs-cmms-api',
} as unknown as CmmsRuntimeConfig;

function claims(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-cmms-api',
    sub: 'cmuser0000000000000000001',
    tenant_id: 'cmtenant00000000000000001',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['cmms:*'],
    persona_type: 'TENANT_ADMIN',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 60,
    jti: 'jti-1',
    ...overrides,
  };
}

function run(token: string | undefined, required: string[] = ['cmms.assets.read'], revoked: boolean | Error = false) {
  const database = {
    isContextRevoked: vi.fn(async () => {
      if (revoked instanceof Error) throw revoked;
      return revoked;
    }),
  } as unknown as DatabaseService;
  const reflector = { getAllAndOverride: vi.fn(() => required) } as unknown as Reflector;
  const request: Record<string, any> = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  const guard = new CmmsAuthorizationGuard(config, reflector, database);
  return { result: guard.canActivate(context), request, database };
}

const sign = (overrides: Partial<PlatformContextV1> = {}, key = signer.privateKey) =>
  signPlatformContextToken(claims(overrides), key);

describe('CmmsAuthorizationGuard', () => {
  it('admits a valid context and derives the principal from the token only', async () => {
    const { result, request, database } = run(sign());
    await expect(result).resolves.toBe(true);
    expect(request.cmmsPrincipal).toMatchObject({
      tenantId: 'cmtenant00000000000000001',
      subject: 'cmuser0000000000000000001',
      departmentScope: { mode: 'ALL' },
      placeScope: { mode: 'ALL' },
    });
    expect(database.isContextRevoked).toHaveBeenCalledWith({
      tenantId: 'cmtenant00000000000000001',
      subject: 'cmuser0000000000000000001',
      sessionId: 'session-1',
      authVersion: 3,
    });
  });

  it('refuses missing, foreign-key, wrong-audience and expired tokens', async () => {
    await expect(run(undefined).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(sign({}, stranger.privateKey)).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(sign({ aud: 'gigalibs-workforce-api' })).result).rejects.toBeInstanceOf(UnauthorizedException);
    const past = Math.floor(Date.now() / 1000) - 3_600;
    await expect(run(sign({ iat: past - 60, exp: past })).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses another module entitlement and an invalid tenant id', async () => {
    await expect(
      run(sign({ entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' } })).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(sign({ tenant_id: "x' OR '1'='1" })).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the permission unless cmms:* or * is granted', async () => {
    await expect(run(sign({ granted_scopes: ['cmms.assets.read'] }), ['cmms.assets.write']).result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run(sign({ granted_scopes: ['workforce:*'] })).result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(sign({ granted_scopes: ['cmms.assets.read'] })).result).resolves.toBe(true);
    expect(hasCmmsPermission(['*'], 'cmms.parts.write')).toBe(true);
    expect(hasCmmsPermission(['cmms:*'], 'cmms.parts.write')).toBe(true);
    expect(hasCmmsPermission(['cmms:read'], 'cmms.parts.read')).toBe(false);
  });

  it('refuses revoked sessions and fails closed when revocation state is unavailable', async () => {
    await expect(run(sign(), undefined, true).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(sign(), undefined, new Error('db down')).result).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps snake-case org scope and place scope, keeping empty lists fail-closed', async () => {
    const scoped = run(
      sign({
        org_scope: { mode: 'SCOPED_DEPARTMENTS', department_ids: ['dept-a'] },
        spatial_scope: { mode: 'SCOPED_PLACES', place_ids: ['6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f'] },
      }),
    );
    await scoped.result;
    expect(scoped.request.cmmsPrincipal.departmentScope).toEqual({ mode: 'DEPARTMENTS', departmentIds: ['dept-a'] });
    expect(scoped.request.cmmsPrincipal.placeScope).toEqual({
      mode: 'PLACES',
      placeIds: ['6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f'],
    });
    const empty = run(sign({ org_scope: { mode: 'SCOPED_DEPARTMENTS', department_ids: [] } }));
    await empty.result;
    expect(empty.request.cmmsPrincipal.departmentScope).toEqual({ mode: 'DEPARTMENTS', departmentIds: [] });
  });
});
