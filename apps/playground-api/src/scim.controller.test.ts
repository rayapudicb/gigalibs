import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { signJwt } from '@gigalibs/auth-core';
import { JwtAuthGuard } from '@gigalibs/auth-nest';
import { RbacGuard, RbacService } from '@gigalibs/rbac-nest';
import { TenantBoundaryGuard } from '@gigalibs/tenancy-nest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// HTTP authorization regression tests. Persistence is separately proved against isolated PostgreSQL.
const state = vi.hoisted(() => ({ tenant: 'scim-test-a' as string | undefined, role: 'MEMBER', active: true }));
vi.mock('@gigalibs/db', () => ({
  prisma: {
    session: { findFirst: async () => ({ tenantId: state.tenant ?? null, user: { status: 'ACTIVE' }, tenant: { settings: { security: { enforceMfa: false } } } }) },
    tenantMember: { findUnique: async () => ({
      role: state.role, status: state.active ? 'ACTIVE' : 'SUSPENDED', permissions: [], customRole: null,
      user: { status: 'ACTIVE' },
      tenant: { id: state.tenant, slug: 'scim-test-a-slug', status: 'ACTIVE', features: [], plan: 'ENTERPRISE' },
    }) },
  },
}));

import { ScimController } from './scim.controller.js';
import { ScimService } from './scim.service.js';

describe('SCIM HTTP authorization (real JWT, tenant and RBAC guards)', () => {
  let app: INestApplication;
  let base: string;
  const secret = randomBytes(48).toString('hex');
  const service = {
    getSchemas: vi.fn(() => []), getServiceProviderConfig: vi.fn(() => ({})), getResourceTypes: vi.fn(() => []),
    listUsers: vi.fn(() => ({ Resources: [] })), getUser: vi.fn(() => ({ id: 'target' })),
    createUser: vi.fn(() => ({ id: 'target' })), patchUser: vi.fn(() => ({ id: 'target' })),
    deleteUser: vi.fn(), listGroups: vi.fn(() => ({ Resources: [] })),
  };

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    class ScimTestModule {}
    app = await NestFactory.create({
      module: ScimTestModule, controllers: [ScimController],
      providers: [{ provide: ScimService, useValue: service }],
    }, { logger: false });
    const reflector = new Reflector();
    app.useGlobalGuards(new JwtAuthGuard(reflector), new TenantBoundaryGuard(), new RbacGuard(reflector, new RbacService()));
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/scim/v2`;
  });
  beforeEach(() => { state.tenant = 'scim-test-a'; state.role = 'MEMBER'; state.active = true; vi.clearAllMocks(); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${signJwt({ sub: 'actor', sid: 'session', ...(state.tenant ? { tid: state.tenant } : {}), roles: ['SUPER_ADMIN'] }, secret, 300)}`,
      'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });

  it('keeps discovery public but refuses anonymous user access', async () => {
    expect((await fetch(`${base}/Schemas`)).status).toBe(200);
    expect((await fetch(`${base}/Users`)).status).toBe(401);
  });
  it('does not accept signed token roles as current write authority', async () => {
    for (const [method, path, body] of [
      ['POST', '/Users', { userName: 'person@example.invalid' }],
      ['PATCH', '/Users/target', { Operations: [{ op: 'replace', path: 'roles', value: [{ value: 'TENANT_ADMIN' }] }] }],
      ['DELETE', '/Users/target', undefined],
    ] as const) expect((await call(path, method, body)).status).toBe(403);
    expect(service.createUser).not.toHaveBeenCalled();
    expect(service.patchUser).not.toHaveBeenCalled();
    expect(service.deleteUser).not.toHaveBeenCalled();
  });
  it('allows scoped member reads and refuses reads without read permission', async () => {
    expect((await call('/Users')).status).toBe(200);
    expect(service.listUsers).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'scim-test-a' }));
    state.role = 'VIEWER';
    expect((await call('/Users')).status).toBe(403);
  });
  it('requires a selected, active tenant membership', async () => {
    state.tenant = undefined;
    expect((await call('/Users')).status).toBe(403);
    state.tenant = 'scim-test-a'; state.active = false;
    expect((await call('/Users')).status).toBe(403);
    expect(service.listUsers).not.toHaveBeenCalled();
  });
  it('refuses conflicting tenant identifiers on header, query and body', async () => {
    state.role = 'TENANT_ADMIN';
    expect((await call('/Users', 'GET', undefined, { 'x-tenant-id': 'scim-test-b' })).status).toBe(403);
    expect((await call('/Users?tenantId=scim-test-b')).status).toBe(403);
    expect((await call('/Users', 'POST', { userName: 'person@example.invalid', tenantId: 'scim-test-b' })).status).toBe(403);
    expect(service.createUser).not.toHaveBeenCalled();
  });
  it('passes verified tenant and actor for an authorized mutation, including a matching slug header', async () => {
    state.role = 'TENANT_ADMIN';
    expect((await call('/Users', 'POST', { userName: 'person@example.invalid' }, { 'x-tenant-id': 'scim-test-a-slug' })).status).toBe(201);
    expect(service.createUser).toHaveBeenCalledWith(expect.objectContaining({ userName: 'person@example.invalid' }), 'scim-test-a', 'actor');
  });
  it('rejects prohibited roles before calling the domain service', async () => {
    state.role = 'TENANT_ADMIN';
    expect((await call('/Users', 'POST', { userName: 'person@example.invalid', roles: [{ value: 'SUPER_ADMIN' }] })).status).toBe(400);
    expect((await call('/Users/target', 'PATCH', { Operations: [{ op: 'replace', path: 'roles', value: [{ value: 'SUPER_ADMIN' }] }] })).status).toBe(400);
    expect(service.createUser).not.toHaveBeenCalled();
    expect(service.patchUser).not.toHaveBeenCalled();
  });
});
