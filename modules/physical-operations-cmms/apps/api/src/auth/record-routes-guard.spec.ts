import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import {
  RECORD_DISPATCHER,
  type RecordDispatcher,
  createRecordController,
} from '@gigalibs/module-sdk';
import { type INestApplication, Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { CMMS_AUDIENCE, CMMS_MODULE_KEY, type CmmsRuntimeConfig } from '../runtime-config.js';
import { CmmsAuthorizationGuard } from './authorization.js';

// WI-OI-120ag: the record routes' baseline permission (`cmms:read`, declared with the module SDK's RequirePermissions)
// is enforced by the CMMS guard itself, over HTTP, as the web gateway reaches the routes. The dispatcher here is a stub
// that would serve anyone, so every refusal below comes from the guard.

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config = {
  platformContextPublicKey: publicKey,
  platformContextAudience: CMMS_AUDIENCE,
} as unknown as CmmsRuntimeConfig;

const list = vi.fn(async (principal: { tenantId: string }, entity: string) => ({
  items: [{ id: 'asset-1', entity, tenant: principal.tenantId }],
  total: 1,
  page: 1,
  pageSize: 25,
}));
const dispatcher = { list } as unknown as RecordDispatcher;

// The CMMS guard takes its database by type, and the test transform emits no decorator metadata, so Nest could not
// construct it here. This subclass only supplies the constructor; `canActivate` is the CMMS guard's own.
@Injectable()
class CmmsGuardUnderTest extends CmmsAuthorizationGuard {
  constructor(@Inject(Reflector) reflector: Reflector) {
    super(config, reflector, { isContextRevoked: async () => false } as unknown as DatabaseService);
  }
}

@Module({
  controllers: [createRecordController({ guard: CmmsGuardUnderTest, readPermission: 'cmms:read' })],
  providers: [{ provide: RECORD_DISPATCHER, useValue: dispatcher }],
})
class RecordRoutesGuardProofModule {}

function token(grantedScopes: string[]): string {
  const now = Math.floor(Date.now() / 1000);
  const context: PlatformContextV1 = {
    iss: 'gigalibs-control-plane',
    aud: CMMS_AUDIENCE,
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 1,
    roles: ['MEMBER'],
    granted_scopes: grantedScopes,
    persona_type: 'WORKFORCE_MEMBER',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: CMMS_MODULE_KEY, status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 300,
    jti: `jti-${grantedScopes.join('-') || 'none'}`,
  };
  return signPlatformContextToken(context, privateKey);
}

describe('CMMS record routes enforce their baseline permission in the guard (WI-OI-120ag)', () => {
  let app: INestApplication;
  let base: string;
  const get = (path: string, scopes?: string[]) =>
    fetch(`${base}${path}`, {
      headers: scopes ? { Authorization: `Bearer ${token(scopes)}` } : {},
    });

  beforeAll(async () => {
    app = await NestFactory.create(RecordRoutesGuardProofModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('refuses a caller without cmms:read, even holding a record permission, before the dispatcher runs', async () => {
    list.mockClear();
    expect((await get('/v1/records/cmms.assets', ['cmms.assets.read'])).status).toBe(403);
    expect((await get('/v1/records/cmms.assets', [])).status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('refuses a caller without a signed context', async () => {
    expect((await get('/v1/records/cmms.assets')).status).toBe(401);
  });

  it('lets a caller with cmms:read through to the dispatcher, as the signed-in principal', async () => {
    list.mockClear();
    const response = await get('/v1/records/cmms.assets', ['cmms:read']);
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toMatchObject({ tenantId: 'tenant-1' });
  });
});
