import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  RECORD_DISPATCHER,
  createRecordController,
} from '@gigalibs/module-sdk';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GigaOpsAuthorizationGuard } from '../auth/authorization.js';
import { GIGAOPS_CONFIG } from '../config.provider.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import type { GigaOpsRuntimeConfig } from '../runtime-config.js';
import {
  type WorkforceRecordDependencies,
  workforceRecordDispatcher,
} from './workforce-record-adapters.js';

// WI-OI-120u security review (B1): the record routes, through the real Workforce guard over HTTP, as the web gateway
// reaches them. The adapter specs call the dispatcher directly; this one proves the guard hands the routes the caller.

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config = {
  nodeEnv: 'test',
  apiHost: '127.0.0.1',
  apiPort: 4700,
  corsOrigins: [],
  databaseUrl: 'postgresql://runtime:unused@127.0.0.1:1/unused',
  databasePoolSize: 1,
  expectedMigrationVersion: 27,
  platformContextPublicKey: publicKey,
  platformContextAudience: 'gigalibs-workforce-api',
} as unknown as GigaOpsRuntimeConfig;

const RESOURCE = {
  id: '11111111-1111-4111-8111-111111111111',
  referenceCode: 'EMP-001',
  displayName: 'Ana Ortiz',
  resourceType: 'HUMAN',
  platformUserId: null,
  status: 'ACTIVE',
  version: 1,
  qualificationCount: 0,
  createdAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
};

const resources = {
  listResources: vi.fn(async (principal: { tenantId: string; spatialScope?: unknown }) => {
    // The Workforce principal itself reaches the service (its place scope is read there).
    if (principal.tenantId !== 'tenant-1' || !principal.spatialScope)
      throw new Error('not the Workforce principal');
    return {
      items: [RESOURCE],
      total: 1,
      page: 1,
      pageSize: 25,
      generatedAt: '2026-10-13T00:00:00.000Z',
    };
  }),
  lookupResources: vi.fn(async () => [RESOURCE]),
};
const noIdempotency: IdempotencyStore = {
  claim: async () => null,
  complete: async () => undefined,
  release: async () => undefined,
};

const RecordController = createRecordController({
  guard: GigaOpsAuthorizationGuard,
  readPermission: 'workforce:read',
});

@Module({
  controllers: [RecordController],
  providers: [
    { provide: GIGAOPS_CONFIG, useValue: config },
    { provide: WorkforceDatabaseService, useValue: { isContextRevoked: async () => false } },
    GigaOpsAuthorizationGuard,
    {
      provide: RECORD_DISPATCHER,
      useFactory: () =>
        workforceRecordDispatcher(
          {
            resources,
            jobs: {},
            availability: {},
            bookings: {},
          } as unknown as WorkforceRecordDependencies,
          noIdempotency,
        ),
    },
  ],
})
class RecordRoutesProofModule {}

function token(grantedScopes: string[]): string {
  const now = Math.floor(Date.now() / 1000);
  const context: PlatformContextV1 = {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-workforce-api',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    session_id: 'session-1',
    auth_version: 1,
    roles: ['MEMBER'],
    granted_scopes: grantedScopes,
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 300,
    jti: `jti-${grantedScopes.join('-')}`,
  };
  return signPlatformContextToken(context, privateKey);
}

describe('Workforce record routes through the Workforce guard (B1)', () => {
  let app: INestApplication;
  let base: string;
  const get = (path: string, scopes?: string[]) =>
    fetch(`${base}${path}`, {
      headers: scopes ? { Authorization: `Bearer ${token(scopes)}` } : {},
    });

  beforeAll(async () => {
    app = await NestFactory.create(RecordRoutesProofModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('serves a signed-in reader their records and lookups', async () => {
    const list = await get('/v1/records/wf.resources', [
      'workforce:read',
      'workforce.resources.read',
    ]);
    expect(list.status).toBe(200);
    expect(
      ((await list.json()) as { items: { 'display-name': string }[] }).items[0]?.['display-name'],
    ).toBe('Ana Ortiz');
    const lookup = await get('/v1/lookups/wf-resources?search=ana', [
      'workforce:read',
      'workforce.resources.read',
    ]);
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toEqual([{ value: RESOURCE.id, label: 'Ana Ortiz (EMP-001)' }]);
  });

  it('refuses a caller without a signed context', async () => {
    expect((await get('/v1/records/wf.resources')).status).toBe(401);
  });

  it("enforces the routes' baseline workforce:read as well as each record's own permission", async () => {
    expect((await get('/v1/records/wf.resources', ['workforce.resources.read'])).status).toBe(403);
    expect((await get('/v1/records/wf.resources', ['workforce:read'])).status).toBe(403);
  });
});
