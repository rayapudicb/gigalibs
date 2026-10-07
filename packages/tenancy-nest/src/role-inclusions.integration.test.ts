import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120w (R2 slice 2c, ADR-0034 §2): a role that includes other roles grants their permissions too, at the scope it
// is held; editing inclusions is a grant. Runs only against the throwaway `r2_proof` database (127.0.0.1:55433);
// skipped without R2_TEST_DATABASE_URL.
const databaseUrl = process.env.R2_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r2_proof') throw new Error('Refusing: only the r2_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('roles that include roles (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-2c-${run}`;
  const admin = `admin-${run}`;
  const editor = `editor-${run}`;
  const worker = `worker-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: import('./tenancy.service.js').TenancyService;
  let memberRoleGrants: typeof import('@gigalibs/rbac-nest').memberRoleGrants;
  const id = (name: string) => `${name}-${run}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    ({ memberRoleGrants } = await import('@gigalibs/rbac-nest'));
    service = new (await import('./tenancy.service.js')).TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R2 2c', status: 'ACTIVE' } });
    await db.user.createMany({ data: [admin, editor, worker].map((user) => ({ id: user, email: `${user}@r2c.invalid`, name: user, status: 'ACTIVE' as const })) });
    await db.customRole.createMany({
      data: [
        { id: id('lead'), tenantId, name: 'Maintenance lead', permissions: [] },
        { id: id('planner'), tenantId, name: 'Maintenance planner', permissions: ['cmms:read', 'cmms.work-orders.write'] },
        { id: id('supervisor'), tenantId, name: 'Workforce supervisor', permissions: ['workforce:read', 'workforce.timesheets.approve'] },
        { id: id('technician'), tenantId, name: 'Maintenance technician', permissions: ['cmms:read', 'cmms.work-orders.read'] },
        { id: id('desk'), tenantId, name: 'Front desk', permissions: ['cmms:read'] },
        { id: id('office'), tenantId, name: 'Back office', permissions: ['finance:read'] },
      ],
    });
    await db.tenantMember.createMany({
      data: [
        { id: `m-admin-${run}`, userId: admin, tenantId, role: 'TENANT_ADMIN' },
        // A Member who edits roles and holds what the planner role grants, but nothing of Workforce.
        { id: `m-editor-${run}`, userId: editor, tenantId, role: 'MEMBER', permissions: ['roles:update', 'cmms:read', 'cmms.work-orders.write'] },
        { id: `m-worker-${run}`, userId: worker, tenantId, role: 'MEMBER' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const edit = async (roleId: string, actorId: string, changes: Record<string, unknown>) => {
    const role = await db.customRole.findUniqueOrThrow({ where: { id: roleId } });
    return service.updateCustomRole(tenantId, roleId, actorId, { expectedUpdatedAt: role.updatedAt.toISOString(), reason: 'Role edit', ...changes } as never).then(
      () => 'OK',
      (error: { getResponse?: () => unknown }) => (error.getResponse?.() as { code?: string } | undefined)?.code ?? String(error),
    );
  };

  it("gives a lead's holder what every included role grants, through the session", async () => {
    expect(await edit(id('lead'), admin, { includes: [id('planner'), id('supervisor')] })).toBe('OK');
    await service.assignMemberRole(tenantId, `m-worker-${run}`, admin, { customRoleId: id('lead'), reason: 'Leads the shift' });
    const grants = await memberRoleGrants(db, tenantId, worker);
    expect(grants.permissions).toEqual(expect.arrayContaining(['cmms.work-orders.write', 'workforce.timesheets.approve']));
    expect(grants.assignments[0]!.permissions).toEqual(expect.arrayContaining(['cmms:read', 'cmms.work-orders.write', 'workforce:read', 'workforce.timesheets.approve']));
    expect((await service.listCustomRoles(tenantId)).find((role) => role.id === id('lead'))?.includes?.sort()).toEqual([id('planner'), id('supervisor')].sort());
  });

  it('refuses a cycle, and deleting a role that another includes', async () => {
    expect(await edit(id('planner'), admin, { includes: [id('lead')] })).toBe('ROLE_INCLUSION_CYCLE');
    const refused = await service.deleteCustomRole(tenantId, id('supervisor'), admin, 'Not needed').catch((error: { getResponse: () => unknown }) => error.getResponse());
    expect(refused).toMatchObject({ code: 'ROLE_INCLUDED' });
  });

  it('treats including a role as giving its permissions: a non-admin includes only what they hold', async () => {
    // The editor holds the planner codes but no Workforce code.
    expect(await edit(id('desk'), editor, { includes: [id('supervisor')] })).toBe('GRANT_BEYOND_OWN');
    expect(await edit(id('desk'), editor, { includes: [id('planner')] })).toBe('OK');
  });

  it("keeps a holder's scopes consistent when an inclusion changes, and never blocks taking one out", async () => {
    // The worker holds the technician role for the whole workspace (CMMS) beside the lead at their own scope: including
    // Workforce codes, which CMMS also checks, in a role held at their own scope gives CMMS two scopes.
    await db.memberRoleAssignment.updateMany({ where: { tenantId, userId: worker }, data: { revokedAt: new Date(), revokedById: admin, revokeReason: 'Reset' } });
    await service.assignMemberRole(tenantId, `m-worker-${run}`, admin, { customRoleId: id('technician'), reason: 'Plant', scope: { kind: 'WORKSPACE' } });
    // Back office (Finance only) at their own scope sits beside it: CMMS checks no Finance code.
    await service.assignMemberRole(tenantId, `m-worker-${run}`, admin, { customRoleId: id('office'), reason: 'Office' });
    // Including Workforce supervisor would bring Workforce codes, which CMMS also checks, at their own scope.
    expect(await edit(id('office'), admin, { includes: [id('supervisor')] })).toBe('ROLE_SCOPE_CONFLICT');
    expect(await db.customRoleInclusion.count({ where: { tenantId, roleId: id('office') } })).toBe(0);
    expect(await edit(id('lead'), admin, { includes: [] })).toBe('OK');
    expect(await db.customRoleInclusion.count({ where: { tenantId, roleId: id('lead') } })).toBe(0);
  });
});
