/**
 * WI-OI-120p slice 7 (R14): the delegated grant authorizes like the delegated invite but targets EXISTING members.
 * This proves the authorization and all-or-nothing behaviour end to end against a real control database (a non-member,
 * an out-of-unit row, and a mixed batch are all refused and grant nothing). The successful scoped write itself goes
 * through resolveRoleScope + assignMemberRole's invariants (needs an organization version in force) and is covered by
 * their own tests. Runs only against the throwaway `r14_proof` database; skipped without R14_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.R14_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r14_proof') throw new Error('Refusing: only the r14_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R14 delegated grant authorization (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-dg-${run}`;
  const head = `head-${run}`;
  const member = `member-${run}`;
  const memberEmail = `member-${run}@dg.invalid`;
  const stranger = `stranger-${run}@dg.invalid`;
  const peopleManager = `people-mgr-${run}`;
  const tech = `maint-tech-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: InstanceType<typeof import('./tenancy.service.js').TenancyService>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const { TenancyService } = await import('./tenancy.service.js');
    service = new TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Delegated grant proof', status: 'ACTIVE' } });
    await db.user.createMany({
      data: [
        { id: head, email: `${head}@dg.invalid`, name: 'Head', status: 'ACTIVE' },
        { id: member, email: memberEmail, name: 'Existing member', status: 'ACTIVE' },
      ],
    });
    await db.tenantMember.createMany({
      data: [
        { id: `m-head-${run}`, userId: head, tenantId, role: 'MEMBER' },
        { id: `m-exist-${run}`, userId: member, tenantId, role: 'MEMBER' },
      ],
    });
    await db.customRole.createMany({
      data: [
        { id: peopleManager, tenantId, name: 'People manager', permissions: ['people:manage'], isSystem: true },
        { id: tech, tenantId, name: 'Maintenance technician', permissions: ['cmms:read'], isSystem: true },
      ],
    });
    await db.memberRoleAssignment.createMany({
      data: [
        { tenantId, userId: head, customRoleId: peopleManager, scope: 'UNITS', unitIds: ['north'], reason: 'proof', grantedById: head },
        { tenantId, userId: head, customRoleId: tech, scope: 'WORKSPACE', reason: 'proof', grantedById: head },
      ],
    });
    await db.departmentRoleAllowance.create({ data: { tenantId, unitId: 'north', customRoleId: tech, createdById: 'admin' } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const grantedCount = () => db.memberRoleAssignment.count({ where: { tenantId, userId: member, customRoleId: tech, revokedAt: null } });

  it('refuses a non-member target (grant is for existing members; invite newcomers instead) and grants nothing', async () => {
    await expect(
      service.bulkDelegatedGrant(tenantId, head, { rows: [{ email: stranger, unit: 'north', roleIds: [tech] }] }),
    ).rejects.toMatchObject({ response: { code: 'BULK_VALIDATION_FAILED' } });
    expect(await grantedCount()).toBe(0);
  });

  it('refuses a row into a unit the head does not manage, and grants nothing', async () => {
    await expect(
      service.bulkDelegatedGrant(tenantId, head, { rows: [{ email: memberEmail, unit: 'south', roleIds: [tech] }] }),
    ).rejects.toMatchObject({ response: { code: 'BULK_VALIDATION_FAILED' } });
    expect(await grantedCount()).toBe(0);
  });

  it('is all-or-nothing: one bad row in the batch grants nothing for the good rows either', async () => {
    await expect(
      service.bulkDelegatedGrant(tenantId, head, {
        rows: [
          { email: memberEmail, unit: 'north', roleIds: [tech] }, // valid on its own
          { email: stranger, unit: 'north', roleIds: [tech] }, // not a member
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'BULK_VALIDATION_FAILED' } });
    expect(await grantedCount()).toBe(0);
  });
});
