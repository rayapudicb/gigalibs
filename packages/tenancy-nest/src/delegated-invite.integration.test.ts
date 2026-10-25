/**
 * WI-OI-120p slice 4 (R13): the delegated invite → accept → scoped-roles flow, end to end against a real control
 * database. Runs only against the throwaway `r13_proof` database; skipped without R13_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.R13_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r13_proof') throw new Error('Refusing: only the r13_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R13 delegated invite → accept grants scoped roles (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-di-${run}`;
  const head = `head-${run}`;
  const invitee = `invitee-${run}`;
  const inviteeEmail = `invitee-${run}@di.invalid`;
  const peopleManager = `people-mgr-${run}`;
  const tech = `maint-tech-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: InstanceType<typeof import('./tenancy.service.js').TenancyService>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const { TenancyService } = await import('./tenancy.service.js');
    service = new TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Delegated invite proof', status: 'ACTIVE' } });
    await db.user.createMany({
      data: [
        { id: head, email: `${head}@di.invalid`, name: 'Head', status: 'ACTIVE' },
        { id: invitee, email: inviteeEmail, name: 'Invitee', status: 'ACTIVE' },
      ],
    });
    await db.tenantMember.create({ data: { id: `m-head-${run}`, userId: head, tenantId, role: 'MEMBER' } });
    await db.customRole.createMany({
      data: [
        { id: peopleManager, tenantId, name: 'People manager', permissions: ['people:manage'], isSystem: true },
        { id: tech, tenantId, name: 'Maintenance technician', permissions: ['cmms:read'], isSystem: true },
      ],
    });
    // The head holds people:manage scoped to the North unit, and holds the tech role (so may delegate it).
    await db.memberRoleAssignment.createMany({
      data: [
        { tenantId, userId: head, customRoleId: peopleManager, scope: 'UNITS', unitIds: ['north'], reason: 'proof', grantedById: head },
        { tenantId, userId: head, customRoleId: tech, scope: 'WORKSPACE', reason: 'proof', grantedById: head },
      ],
    });
    // North allows the tech role.
    await db.departmentRoleAllowance.create({ data: { tenantId, unitId: 'north', customRoleId: tech, createdById: 'admin' } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('a delegated invite into a managed unit, accepted, grants the tech role scoped to that unit', async () => {
    const invite = await service.delegatedInvite(tenantId, head, { email: inviteeEmail, unitId: 'north', customRoleIds: [tech], expiresInHours: 72 });
    expect(invite.token).toBeTruthy();

    await service.acceptInvite(invitee, { token: invite.token });

    const assignments = await db.memberRoleAssignment.findMany({
      where: { tenantId, userId: invitee, revokedAt: null },
      select: { customRoleId: true, scope: true, unitIds: true },
    });
    expect(assignments).toEqual([{ customRoleId: tech, scope: 'UNITS', unitIds: ['north'] }]);
  });

  it('refuses a delegated invite into a unit the head does not manage', async () => {
    await expect(
      service.delegatedInvite(tenantId, head, { email: `other-${run}@di.invalid`, unitId: 'south', customRoleIds: [tech], expiresInHours: 72 }),
    ).rejects.toMatchObject({ response: { code: 'PEOPLE_ADMIN_OUT_OF_UNIT' } });
  });
});
