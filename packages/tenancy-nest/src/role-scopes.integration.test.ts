import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120w (R2 slice 2b, ADR-0034 §1 and §6): roles given at an explicit scope, and the transition rule wherever a
// member's access can change scope. Runs only against the throwaway `r2_proof` database (127.0.0.1:55433); skipped
// without R2_TEST_DATABASE_URL.
const databaseUrl = process.env.R2_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r2_proof') throw new Error('Refusing: only the r2_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('roles at a scope (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-2b-${run}`;
  const admin = `admin-${run}`;
  const lead = `lead-${run}`;
  const tech = `tech-${run}`;
  const other = `other-${run}`;
  const place = '5f0c6a0e-6a8e-4c1b-9b1e-2f7c3c9d1a11';
  let db: typeof import('@gigalibs/db').prisma;
  let service: import('./tenancy.service.js').TenancyService;
  let memberRoleGrants: typeof import('@gigalibs/rbac-nest').memberRoleGrants;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    ({ memberRoleGrants } = await import('@gigalibs/rbac-nest'));
    service = new (await import('./tenancy.service.js')).TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R2 2b', status: 'ACTIVE' } });
    await db.user.createMany({ data: [admin, lead, tech, other].map((id) => ({ id, email: `${id}@r2b.invalid`, name: id, status: 'ACTIVE' as const })) });
    await db.customRole.createMany({
      data: [
        { id: `technician-${run}`, tenantId, name: 'Maintenance technician', permissions: ['cmms:read', 'cmms.work-orders.read'] },
        { id: `worker-${run}`, tenantId, name: 'Workforce member', permissions: ['workforce:read', 'workforce.time.punch'] },
        { id: `people-${run}`, tenantId, name: 'People desk', permissions: ['users:read', 'users:update'] },
        { id: `reader-${run}`, tenantId, name: 'Finance reader', permissions: ['finance:read'] },
        { id: `writer-${run}`, tenantId, name: 'Work order writer', permissions: ['cmms.work-orders.write'] },
      ],
    });
    await db.tenantMember.createMany({
      data: [
        { id: `m-admin-${run}`, userId: admin, tenantId, role: 'TENANT_ADMIN' },
        { id: `m-lead-${run}`, userId: lead, tenantId, role: 'MEMBER', permissions: ['roles:assign', 'cmms:read', 'cmms.work-orders.read'] },
        { id: `m-tech-${run}`, userId: tech, tenantId, role: 'MEMBER' },
        { id: `m-other-${run}`, userId: other, tenantId, role: 'MEMBER' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const give = (memberId: string, actorId: string, roleId: string, scope?: Record<string, unknown>) =>
    service
      .assignMemberRole(tenantId, memberId, actorId, { customRoleId: roleId, reason: 'Role at a scope', ...(scope ? { scope: scope as never } : {}) })
      .then(
        () => 'OK',
        (error: { getResponse?: () => unknown }) => (error.getResponse?.() as { code?: string } | undefined)?.code ?? String(error),
      );
  const update = async (memberId: string, actorId: string, changes: Record<string, unknown>) => {
    const member = await db.tenantMember.findUniqueOrThrow({ where: { id: memberId } });
    return service
      .updateMember(tenantId, memberId, actorId, { expectedUpdatedAt: member.updatedAt.toISOString(), reason: 'Team change', ...changes } as never)
      .then(
        () => 'OK',
        (error: { getResponse?: () => unknown }) => (error.getResponse?.() as { code?: string } | undefined)?.code ?? String(error),
      );
  };

  it('gives a role for the whole workspace, only as an administrator, and units or places only where enforced', async () => {
    expect(await give(`m-tech-${run}`, lead, `technician-${run}`, { kind: 'WORKSPACE' })).toBe('ROLE_SCOPE_ADMIN_ONLY');
    // Security review of 2b (H1, H2): no module is proven to limit records by places or units yet.
    expect(await give(`m-tech-${run}`, admin, `technician-${run}`, { kind: 'PLACES', placeIds: [place] })).toBe('ROLE_SCOPE_NOT_ENFORCED');
    expect(await give(`m-tech-${run}`, admin, `technician-${run}`, { kind: 'UNITS', unitIds: ['north'] })).toBe('ROLE_SCOPE_NOT_ENFORCED');
    expect(await give(`m-tech-${run}`, admin, `technician-${run}`, { kind: 'WORKSPACE' })).toBe('OK');
    expect(await give(`m-other-${run}`, admin, `people-${run}`, { kind: 'WORKSPACE' })).toBe('OK');
    // The session sees each role with its scope.
    expect((await memberRoleGrants(db, tenantId, tech)).assignments).toEqual([
      { permissions: ['cmms:read', 'cmms.work-orders.read'], scope: 'WORKSPACE', unitIds: [], placeIds: [] },
    ]);
  });

  it('refuses a role that would give a module this person\'s access at a second scope, naming the module', async () => {
    const refused = await service
      .assignMemberRole(tenantId, `m-tech-${run}`, admin, { customRoleId: `worker-${run}`, reason: 'Clocks in too' })
      .catch((error: { getResponse: () => unknown }) => error.getResponse());
    expect(refused).toMatchObject({ code: 'ROLE_SCOPE_CONFLICT', modules: expect.arrayContaining(['asset-maintenance']) });
    expect((refused as { message: string }).message).toContain('Asset & Maintenance (CMMS)');
    // A role no module of the first one checks may be held at the member's own scope beside it.
    expect(await give(`m-tech-${run}`, admin, `reader-${run}`)).toBe('OK');
  });

  it('keeps workspace permissions, and codes the platform checks, off units and places', async () => {
    expect(await give(`m-tech-${run}`, admin, `people-${run}`, { kind: 'PLACES', placeIds: [place] })).toBe('ROLE_SCOPE_WORKSPACE_ONLY');
    expect(await give(`m-other-${run}`, admin, `reader-${run}`, { kind: 'UNITS', unitIds: ['north'] })).toBe('ROLE_SCOPE_NOT_ENFORCED');
  });

  it('refuses a base role or a role edit that would give a module a second scope', async () => {
    // Tenant Admin's base role grants CMMS at the member's own scope, beside the technician role for the whole workspace.
    expect(await update(`m-tech-${run}`, admin, { role: 'TENANT_ADMIN' })).toBe('ROLE_SCOPE_CONFLICT');
    // A Manager's base role checks nothing CMMS checks.
    expect(await update(`m-tech-${run}`, admin, { role: 'MANAGER' })).toBe('OK');
    // Finance reader (own scope) gaining a CMMS code would give CMMS two scopes for the technician.
    const reader = await db.customRole.findUniqueOrThrow({ where: { id: `reader-${run}` } });
    const edit = (roleId: string, permissions: string[], updatedAt: Date) =>
      service.updateCustomRole(tenantId, roleId, admin, { expectedUpdatedAt: updatedAt.toISOString(), permissions, reason: 'Role edit' }).then(
        () => 'OK',
        (error: { getResponse?: () => unknown }) => (error.getResponse?.() as { code?: string } | undefined)?.code ?? String(error),
      );
    expect(await edit(`reader-${run}`, ['finance:read', 'cmms:read'], reader.updatedAt)).toBe('ROLE_SCOPE_CONFLICT');
    // Held for the whole workspace, the technician role may gain codes; removing codes is never blocked (review M2).
    let technician = await db.customRole.findUniqueOrThrow({ where: { id: `technician-${run}` } });
    expect(await edit(`technician-${run}`, ['cmms:read', 'cmms.work-orders.read', 'cmms.assets.read'], technician.updatedAt)).toBe('OK');
    technician = await db.customRole.findUniqueOrThrow({ where: { id: `technician-${run}` } });
    expect(await edit(`technician-${run}`, ['cmms:read'], technician.updatedAt)).toBe('OK');
  });

  // Security review of 2b (M1): a role held only at some units gives nothing to pass on.
  it('counts only own-scope and workspace roles in what a non-admin may give', async () => {
    await db.memberRoleAssignment.create({
      data: { tenantId, userId: lead, customRoleId: `writer-${run}`, scope: 'UNITS', unitIds: ['north'], reason: 'Held at North only', grantedById: admin },
    });
    expect(await give(`m-other-${run}`, lead, `writer-${run}`)).toBe('GRANT_BEYOND_OWN');
    await db.memberRoleAssignment.updateMany({ where: { tenantId, userId: lead, customRoleId: `writer-${run}` }, data: { revokedAt: new Date(), revokedById: admin, revokeReason: 'Proof' } });
    await db.memberRoleAssignment.create({
      data: { tenantId, userId: lead, customRoleId: `writer-${run}`, scope: 'WORKSPACE', reason: 'Held everywhere', grantedById: admin },
    });
    expect(await give(`m-other-${run}`, lead, `writer-${run}`)).toBe('OK');
  });
});
