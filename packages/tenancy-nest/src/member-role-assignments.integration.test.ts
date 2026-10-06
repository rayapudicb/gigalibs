import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120w (R2 slice 1): a change of `customRoleId` revokes the old role assignment and grants the new one, and the
// session reads the role from the assignment. Since slice 2a only an earlier release writes the column (release
// 2323b99's member update, as `change` does here); the trigger still has to keep it in step. Runs only against the
// throwaway `r2_proof` database (127.0.0.1:55433); skipped without R2_TEST_DATABASE_URL.
const databaseUrl = process.env.R2_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r2_proof') throw new Error('Refusing: only the r2_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('member role assignments (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-r2-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let memberScopeRoles: typeof import('@gigalibs/rbac-nest').memberScopeRoles;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    ({ memberScopeRoles } = await import('@gigalibs/rbac-nest'));
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R2 proof' } });
    await db.user.createMany({
      data: [
        { id: `admin-${run}`, email: `admin-${run}@r2.invalid`, name: 'Admin' },
        { id: `tech-${run}`, email: `tech-${run}@r2.invalid`, name: 'Tech' },
      ],
    });
    await db.customRole.createMany({
      data: [
        { id: `planner-${run}`, tenantId, name: 'Maintenance planner', permissions: ['cmms:read', 'cmms.work-orders.write'], isSystem: true },
        { id: `technician-${run}`, tenantId, name: 'Maintenance technician', permissions: ['cmms:read', 'cmms.work-orders.read'], isSystem: true },
      ],
    });
    await db.tenantMember.createMany({
      data: [
        { id: `m-admin-${run}`, userId: `admin-${run}`, tenantId, role: 'TENANT_ADMIN' },
        { id: `m-tech-${run}`, userId: `tech-${run}`, tenantId, role: 'MEMBER' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Release 2323b99's member update: it writes the column and tells the trigger who changed the role and why.
  const change = (customRoleId: string | null) =>
    db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.role_change_actor', ${`admin-${run}`}, true), set_config('app.role_change_reason', ${'R2 proof: role change'}, true)`;
      await transaction.tenantMember.update({ where: { id: `m-tech-${run}` }, data: { customRoleId } });
    });
  const live = () => db.memberRoleAssignment.findMany({ where: { tenantId, userId: `tech-${run}`, revokedAt: null } });

  it('grants the role as an assignment at the member scope and keeps the column in step', async () => {
    await change(`technician-${run}`);
    expect(await live()).toEqual([expect.objectContaining({ customRoleId: `technician-${run}`, scope: 'MEMBER', grantedById: `admin-${run}` })]);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { id: `m-tech-${run}` } })).customRoleId).toBe(`technician-${run}`);
    expect(await memberScopeRoles(db, tenantId, `tech-${run}`)).toEqual({ names: ['Maintenance technician'], permissions: ['cmms:read', 'cmms.work-orders.read'] });
  });

  it('revokes the old assignment (with who and why) and grants the new one on a change', async () => {
    await change(`planner-${run}`);
    expect((await live()).map((assignment) => assignment.customRoleId)).toEqual([`planner-${run}`]);
    const revoked = await db.memberRoleAssignment.findFirstOrThrow({ where: { tenantId, userId: `tech-${run}`, customRoleId: `technician-${run}` } });
    expect(revoked).toMatchObject({ revokedById: `admin-${run}`, revokeReason: 'R2 proof: role change' });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes the assignment when the role is cleared, keeping the history', async () => {
    await change(null);
    expect(await live()).toEqual([]);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { id: `m-tech-${run}` } })).customRoleId).toBeNull();
    expect(await db.memberRoleAssignment.count({ where: { tenantId, userId: `tech-${run}` } })).toBe(2);
    expect(await memberScopeRoles(db, tenantId, `tech-${run}`)).toEqual({ names: [], permissions: [] });
  });

  // Security review M1: an earlier release writes only the column; the trigger keeps the assignment in step.
  it('follows a write to customRoleId that skips the service, as an earlier release makes', async () => {
    await db.tenantMember.update({ where: { id: `m-tech-${run}` }, data: { customRoleId: `technician-${run}` } });
    expect(await live()).toEqual([expect.objectContaining({ customRoleId: `technician-${run}`, grantedById: 'system:customRoleId' })]);
    await db.tenantMember.update({ where: { id: `m-tech-${run}` }, data: { customRoleId: null } });
    expect(await live()).toEqual([]); // removed through the old path: it cannot come back
    expect(await memberScopeRoles(db, tenantId, `tech-${run}`)).toEqual({ names: [], permissions: [] });
  });

  it('refuses an explicit scope until slice 2', async () => {
    await expect(
      db.memberRoleAssignment.create({
        data: { tenantId, userId: `tech-${run}`, customRoleId: `technician-${run}`, scope: 'WORKSPACE', reason: 'probe', grantedById: 'probe' },
      }),
    ).rejects.toThrow();
  });

  it("removes a deleted role's assignments with the role", async () => {
    await change(`planner-${run}`);
    await db.customRole.delete({ where: { id: `planner-${run}` } });
    expect(await db.memberRoleAssignment.count({ where: { tenantId, customRoleId: `planner-${run}` } })).toBe(0);
    expect((await db.tenantMember.findUniqueOrThrow({ where: { id: `m-tech-${run}` } })).customRoleId).toBeNull();
  });
});
