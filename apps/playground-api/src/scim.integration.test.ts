import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt-in only. Check the dedicated database identity before importing any module that can initialize Prisma.
const proofUrl = process.env.SCIM_TEST_DATABASE_URL;
if (proofUrl) {
  const parsed = new URL(proofUrl);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55541' || parsed.pathname !== '/scim_proof') {
    throw new Error('Refusing SCIM proof: only the dedicated localhost:55541/scim_proof database is allowed.');
  }
}
describe.skipIf(!proofUrl)('SCIM HTTP and PostgreSQL persistence proof (isolated)', () => {
  let app: INestApplication;
  let db: typeof import('@gigalibs/db').prisma;
  let service: import('./scim.service.js').ScimService;
  let base: string;
  let sign: typeof import('@gigalibs/auth-core').signJwt;
  const run = randomUUID();
  // Match the production CUID-length tenant IDs; audit checkpoint IDs append ':scim'.
  const tenantA = `a${randomBytes(12).toString('hex')}`;
  const tenantB = `b${randomBytes(12).toString('hex')}`;
  const secret = randomBytes(48).toString('hex');
  const tokens = new Map<string, string>();
  const sessionIds = new Map<string, string>();
  const priorUrl = process.env.DATABASE_URL;
  const priorSecret = process.env.JWT_ACCESS_SECRET;

  async function addUser(label: string, tenantId: string, role: 'TENANT_ADMIN' | 'MEMBER' = 'TENANT_ADMIN', existingId?: string, permissions: string[] = []) {
    const id = existingId ?? `${label}-${run}`;
    if (!existingId) await db.user.create({ data: { id, email: `${label}-${run}@example.invalid`, name: label, status: 'ACTIVE' } });
    await db.tenantMember.create({ data: { userId: id, tenantId, role, permissions } });
    const session = await db.session.create({ data: { userId: id, tenantId, refreshToken: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    sessionIds.set(label, session.id);
    tokens.set(label, sign({ sub: id, tid: tenantId, sid: session.id, roles: [] }, secret, 3600));
    return id;
  }
  const call = (who: string, path: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${tokens.get(who)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const patch = (active: boolean) => ({ Operations: [{ op: 'replace', path: 'active', value: active }] });

  beforeAll(async () => {
    process.env.DATABASE_URL = proofUrl!;
    process.env.JWT_ACCESS_SECRET = secret;
    ({ prisma: db } = await import('@gigalibs/db'));
    const identity = await db.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_database()::text AS name');
    if (identity[0]?.name !== 'scim_proof') throw new Error('Unexpected proof database identity.');
    const { NestFactory, Reflector } = await import('@nestjs/core');
    const { JwtAuthGuard } = await import('@gigalibs/auth-nest');
    const { TenantBoundaryGuard } = await import('@gigalibs/tenancy-nest');
    const { RbacGuard, RbacService } = await import('@gigalibs/rbac-nest');
    const { AuditService } = await import('@gigalibs/audit-nest');
    const { ScimController } = await import('./scim.controller.js');
    const { ScimService } = await import('./scim.service.js');
    ({ signJwt: sign } = await import('@gigalibs/auth-core'));
    service = new ScimService(new AuditService());
    for (const id of [tenantA, tenantB]) await db.tenant.create({ data: {
      id, slug: id, name: `WI-OI-120d isolated ${id}`, status: 'ACTIVE',
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: { proof: 'WI-OI-120d', run } } },
    } });
    await addUser('admin-a', tenantA);
    await addUser('admin-b', tenantB);
    await addUser('member', tenantA, 'MEMBER');
    await addUser('creator', tenantA, 'MEMBER', undefined, ['users:create']);
    class ProofModule {}
    app = await NestFactory.create({ module: ProofModule, controllers: [ScimController], providers: [{ provide: ScimService, useValue: service }] }, { logger: false });
    const reflector = new Reflector();
    app.useGlobalGuards(new JwtAuthGuard(reflector), new TenantBoundaryGuard(), new RbacGuard(reflector, new RbacService()));
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/scim/v2`;
  }, 30_000);

  afterAll(async () => {
    await app?.close(); await db?.$disconnect();
    if (priorUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = priorSecret;
  });

  it('persists create and reload; duplicate POST never updates an existing membership', async () => {
    const email = `created-${run}@example.invalid`;
    const result = await call('admin-a', '/Users', 'POST', { userName: email, roles: [{ value: 'VIEWER' }] });
    expect(result.status).toBe(201);
    const user = await result.json() as { id: string };
    expect(await (await call('admin-a', `/Users/${user.id}`)).json()).toMatchObject({ userName: email, roles: [{ value: 'VIEWER' }] });
    expect((await call('creator', '/Users', 'POST', { userName: email, roles: [{ value: 'TENANT_ADMIN' }] })).status).toBe(409);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { userId_tenantId: { userId: user.id, tenantId: tenantA } } })).role).toBe('VIEWER');
    expect((await call('admin-b', `/Users/${user.id}`)).status).toBe(404);
    expect((await call('admin-b', `/Users/${user.id}`, 'PATCH', patch(false))).status).toBe(404);
    expect((await call('admin-b', `/Users/${user.id}`, 'DELETE')).status).toBe(404);
    const audit = await db.auditLog.findFirst({ where: { tenantId: tenantA, resourceId: user.id, action: 'PROVISION' } });
    expect(audit?.userId).toBe(`admin-a-${run}`);
  });

  it('refuses ordinary-member mutations and malicious batches without partial writes', async () => {
    const target = `member-${run}`;
    expect((await call('member', `/Users/${target}`, 'PATCH', { Operations: [{ op: 'replace', path: 'roles', value: [{ value: 'TENANT_ADMIN' }] }] })).status).toBe(403);
    expect((await call('admin-a', `/Users/${target}`, 'PATCH', { Operations: [...patch(false).Operations, { op: 'add', value: { roles: [{ value: 'SUPER_ADMIN' }] } }] })).status).toBe(400);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { userId_tenantId: { userId: target, tenantId: tenantA } } })).status).toBe('ACTIVE');
  });

  it('protects the last active administrator through PATCH, DELETE and duplicate create', async () => {
    const target = `admin-a-${run}`;
    expect((await call('admin-a', `/Users/${target}`, 'PATCH', patch(false))).status).toBe(409);
    expect((await call('admin-a', `/Users/${target}`, 'DELETE')).status).toBe(409);
    expect((await call('admin-a', '/Users', 'POST', { userName: `admin-a-${run}@example.invalid`, active: false })).status).toBe(409);
    expect((await db.session.findUniqueOrThrow({ where: { id: sessionIds.get('admin-a')! } })).status).toBe('ACTIVE');
  });

  // WI-OI-120v: SCIM user permissions manage members, but only a Tenant Admin grants or changes the Tenant Admin role.
  it('refuses a non-administrator who grants, demotes, suspends or removes a Tenant Admin', async () => {
    const hr = await addUser('hr', tenantA, 'MEMBER', undefined, ['users:create', 'users:update', 'users:delete']);
    const target = `member-${run}`;
    const admin = `admin-a-${run}`;
    const role = (value: string) => ({ Operations: [{ op: 'replace', path: 'roles', value: [{ value }] }] });
    expect((await call('hr', `/Users/${target}`, 'PATCH', role('TENANT_ADMIN'))).status).toBe(403);
    expect((await call('hr', `/Users/${hr}`, 'PATCH', role('TENANT_ADMIN'))).status).toBe(403);
    expect((await call('hr', '/Users', 'POST', { userName: `boss-${run}@example.invalid`, roles: [{ value: 'TENANT_ADMIN' }] })).status).toBe(403);
    await addUser('admin-a2', tenantA);
    expect((await call('hr', `/Users/${admin}`, 'PATCH', patch(false))).status).toBe(403);
    expect((await call('hr', `/Users/${admin}`, 'PATCH', role('MEMBER'))).status).toBe(403);
    expect((await call('hr', `/Users/${admin}`, 'DELETE')).status).toBe(403);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { userId_tenantId: { userId: admin, tenantId: tenantA } } })).role).toBe('TENANT_ADMIN');
    expect((await call('hr', `/Users/${target}`, 'PATCH', role('VIEWER'))).status).toBe(200);
    expect((await call('admin-a', `/Users/${target}`, 'PATCH', role('MEMBER'))).status).toBe(200);
  });

  // WI-OI-120x: a SCIM operator who is not a Tenant Admin gives no base role beyond what they hold, nor changes their own.
  it('refuses a non-administrator who gives a base role beyond their own or changes their own role', async () => {
    const lead = await addUser('scim-lead', tenantA, 'MEMBER', undefined, ['users:create', 'users:update']);
    const target = `member-${run}`;
    const role = (value: string) => ({ Operations: [{ op: 'replace', path: 'roles', value: [{ value }] }] });
    expect((await call('scim-lead', `/Users/${target}`, 'PATCH', role('MANAGER'))).status).toBe(403);
    expect((await call('scim-lead', '/Users', 'POST', { userName: `manager-${run}@example.invalid`, roles: [{ value: 'MANAGER' }] })).status).toBe(403);
    expect((await call('scim-lead', `/Users/${lead}`, 'PATCH', role('VIEWER'))).status).toBe(403);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { userId_tenantId: { userId: target, tenantId: tenantA } } })).role).toBe('MEMBER');
    expect((await call('scim-lead', `/Users/${target}`, 'PATCH', role('VIEWER'))).status).toBe(200);
    expect((await call('scim-lead', '/Users', 'POST', { userName: `viewer-${run}@example.invalid`, roles: [{ value: 'VIEWER' }] })).status).toBe(201);
    expect((await call('admin-a', `/Users/${target}`, 'PATCH', role('MANAGER'))).status).toBe(200);
    expect((await call('admin-a', `/Users/${target}`, 'PATCH', role('MEMBER'))).status).toBe(200);
  });

  it('changes only one membership and its sessions for a multi-tenant identity', async () => {
    const id = await addUser('shared-a', tenantA, 'MEMBER');
    await addUser('shared-b', tenantB, 'MEMBER', id);
    expect((await call('admin-a', `/Users/${id}`, 'PATCH', { Operations: [{ op: 'replace', path: 'roles', value: [{ value: 'VIEWER' }] }] })).status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { id: sessionIds.get('shared-a')! } })).status).toBe('REVOKED');
    expect((await call('shared-a', '/Users')).status).toBe(401);
    expect((await call('shared-b', '/Users')).status).toBe(200);
    expect((await call('admin-a', `/Users/${id}`, 'PATCH', patch(false))).status).toBe(200);
    const audits = await db.auditLog.count({ where: { tenantId: tenantA, resourceId: id } });
    expect((await call('admin-a', `/Users/${id}`, 'PATCH', patch(false))).status).toBe(200);
    expect(await db.auditLog.count({ where: { tenantId: tenantA, resourceId: id } })).toBe(audits);
    expect((await call('admin-a', `/Users/${id}`, 'DELETE')).status).toBe(204);
    expect((await call('admin-a', `/Users/${id}`, 'DELETE')).status).toBe(404);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
    expect((await db.tenantMember.findUniqueOrThrow({ where: { userId_tenantId: { userId: id, tenantId: tenantB } } })).role).toBe('MEMBER');
    expect((await db.session.findUniqueOrThrow({ where: { id: sessionIds.get('shared-b')! } })).status).toBe('ACTIVE');
  });

  it('rolls back membership creation if the audit cannot commit', async () => {
    const { ScimService } = await import('./scim.service.js');
    const { AuditService } = await import('@gigalibs/audit-nest');
    class FailingAudit extends AuditService { override async log(): Promise<never> { throw new Error('isolated audit failure'); } }
    const failing = new ScimService(new FailingAudit());
    const email = `rollback-${run}@example.invalid`;
    await expect(failing.createUser({ userName: email }, tenantA, `admin-a-${run}`)).rejects.toThrow('isolated audit failure');
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it('serializes competing removals so at least one active administrator remains', async () => {
    const tenantId = `r${randomBytes(12).toString('hex')}`;
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'WI-OI-120d concurrency proof', settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } } });
    const first = await addUser('race-one', tenantId);
    const second = await addUser('race-two', tenantId);
    const outcomes = await Promise.all([call('race-one', `/Users/${first}`, 'DELETE'), call('race-two', `/Users/${second}`, 'DELETE')]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([204, 409]);
    expect(await db.tenantMember.count({ where: { tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' } })).toBe(1);
  });
});
