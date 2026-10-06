import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120w (R2 slice 2a): a member holds several roles at their own scope, each given and taken away on its own.
// Runs only against the throwaway `r2_proof` database (127.0.0.1:55433); skipped without R2_TEST_DATABASE_URL.
const databaseUrl = process.env.R2_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r2_proof') throw new Error('Refusing: only the r2_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('several roles per member (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-r2a-${run}`;
  const otherTenantId = `t-r2a-other-${run}`;
  const admin = `admin-${run}`;
  const lead = `lead-${run}`;
  const tech = `tech-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: import('./tenancy.service.js').TenancyService;
  let memberScopeRoles: typeof import('@gigalibs/rbac-nest').memberScopeRoles;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    ({ memberScopeRoles } = await import('@gigalibs/rbac-nest'));
    service = new (await import('./tenancy.service.js')).TenancyService();
    await db.tenant.createMany({ data: [{ id: tenantId, slug: tenantId, name: 'R2 2a' }, { id: otherTenantId, slug: otherTenantId, name: 'Other' }] });
    await db.user.createMany({
      data: [admin, lead, tech].map((id) => ({ id, email: `${id}@r2a.invalid`, name: id })),
    });
    await db.customRole.createMany({
      data: [
        { id: `technician-${run}`, tenantId, name: 'Maintenance technician', permissions: ['cmms:read', 'cmms.work-orders.read'], isSystem: true },
        { id: `worker-${run}`, tenantId, name: 'Workforce member', permissions: ['workforce:read', 'workforce.time.punch'], isSystem: true },
        { id: `assigner-${run}`, tenantId, name: 'Role assigner', permissions: ['roles:assign'] },
        { id: `foreign-${run}`, tenantId: otherTenantId, name: 'Foreign role', permissions: ['users:read'] },
      ],
    });
    await db.tenantMember.createMany({
      data: [
        { id: `m-admin-${run}`, userId: admin, tenantId, role: 'TENANT_ADMIN' },
        { id: `m-lead-${run}`, userId: lead, tenantId, role: 'MANAGER' },
        { id: `m-tech-${run}`, userId: tech, tenantId, role: 'MEMBER' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const live = (userId: string) =>
    db.memberRoleAssignment.findMany({ where: { tenantId, userId, revokedAt: null }, orderBy: { createdAt: 'asc' } });
  const column = async (memberId: string) => (await db.tenantMember.findUniqueOrThrow({ where: { id: memberId } })).customRoleId;
  const status = async (promise: Promise<unknown>) =>
    promise.then(
      () => 200,
      (error: { getStatus?: () => number }) => error.getStatus?.() ?? 500,
    );

  it('gives a member two roles; both reach the session; the column names the oldest', async () => {
    await service.assignMemberRole(tenantId, `m-tech-${run}`, admin, { customRoleId: `technician-${run}`, reason: 'Fixes the plant' });
    await service.assignMemberRole(tenantId, `m-tech-${run}`, admin, { customRoleId: `worker-${run}`, reason: 'Clocks in on site' });
    expect((await live(tech)).map((assignment) => assignment.customRoleId)).toEqual([`technician-${run}`, `worker-${run}`]);
    const roles = await memberScopeRoles(db, tenantId, tech);
    expect(roles.names).toEqual(['Maintenance technician', 'Workforce member']);
    expect(roles.permissions).toEqual(expect.arrayContaining(['cmms.work-orders.read', 'workforce.time.punch']));
    expect(await column(`m-tech-${run}`)).toBe(`technician-${run}`);
    expect(await db.auditLog.count({ where: { tenantId, resource: 'member_role_assignment', action: 'PERMISSION_CHANGE' } })).toBe(2);
  });

  it('refuses a role already held and a role of another workspace', async () => {
    expect(await status(service.assignMemberRole(tenantId, `m-tech-${run}`, admin, { customRoleId: `worker-${run}`, reason: 'Again' }))).toBe(409);
    expect(await status(service.assignMemberRole(tenantId, `m-tech-${run}`, admin, { customRoleId: `foreign-${run}`, reason: 'Across' }))).toBe(400);
  });

  it('takes one role away; the other stays and the column moves to it', async () => {
    const [technician] = await live(tech);
    await service.revokeMemberRole(tenantId, `m-tech-${run}`, technician!.id, admin, { reason: 'Moved to the warehouse' });
    expect((await live(tech)).map((assignment) => assignment.customRoleId)).toEqual([`worker-${run}`]);
    expect(await column(`m-tech-${run}`)).toBe(`worker-${run}`);
    const revoked = await db.memberRoleAssignment.findUniqueOrThrow({ where: { id: technician!.id } });
    expect(revoked).toMatchObject({ revokedById: admin, revokeReason: 'Moved to the warehouse' });
  });

  it("refuses changing one's own roles unless one is a Tenant Admin", async () => {
    await service.assignMemberRole(tenantId, `m-lead-${run}`, admin, { customRoleId: `assigner-${run}`, reason: 'Team lead assigns roles' });
    expect(await status(service.assignMemberRole(tenantId, `m-lead-${run}`, lead, { customRoleId: `technician-${run}`, reason: 'Myself' }))).toBe(403);
    expect(await status(service.assignMemberRole(tenantId, `m-tech-${run}`, lead, { customRoleId: `technician-${run}`, reason: 'Back on the plant' }))).toBe(200);
    expect(await status(service.assignMemberRole(tenantId, `m-admin-${run}`, admin, { customRoleId: `worker-${run}`, reason: 'Admin also clocks in' }))).toBe(200);
  });

  it('lets an earlier release replace only the role the column names; the others stay', async () => {
    // The technician holds Workforce member (column, oldest) and Maintenance technician.
    await db.tenantMember.update({ where: { id: `m-tech-${run}` }, data: { customRoleId: `assigner-${run}` } });
    expect((await live(tech)).map((assignment) => assignment.customRoleId).sort()).toEqual([`assigner-${run}`, `technician-${run}`].sort());
  });
});
