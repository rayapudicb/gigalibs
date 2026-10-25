/**
 * WI-OI-120p slice 7 (R14): bulk offboarding — an administrator suspends many members at once, all-or-nothing, with
 * the last workspace administrator protected and the actor's own membership skipped. Runs only against the throwaway
 * `r14_proof` database; skipped without R14_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.R14_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r14_proof') throw new Error('Refusing: only the r14_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R14 bulk offboarding (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-off-${run}`;
  const admin = `admin-${run}`;
  const sup = `super-${run}`;
  const u1 = `u1-${run}`;
  const u2 = `u2-${run}`;
  const u3 = `u3-${run}`;
  const nonAdmin = `non-${run}`;
  const mAdmin = `m-admin-${run}`;
  const mSup = `m-super-${run}`;
  const m1 = `m1-${run}`;
  const m2 = `m2-${run}`;
  const m3 = `m3-${run}`;
  const mNon = `m-non-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: InstanceType<typeof import('./tenancy.service.js').TenancyService>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const { TenancyService } = await import('./tenancy.service.js');
    service = new TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Offboard proof', status: 'ACTIVE' } });
    await db.user.createMany({
      data: [admin, sup, u1, u2, u3, nonAdmin].map((id) => ({ id, email: `${id}@off.invalid`, name: id, status: 'ACTIVE' as const })),
    });
    await db.tenantMember.createMany({
      data: [
        { id: mAdmin, userId: admin, tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' },
        { id: mSup, userId: sup, tenantId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
        { id: m1, userId: u1, tenantId, role: 'MEMBER', status: 'ACTIVE' },
        { id: m2, userId: u2, tenantId, role: 'MEMBER', status: 'ACTIVE' },
        { id: m3, userId: u3, tenantId, role: 'MEMBER', status: 'SUSPENDED' },
        { id: mNon, userId: nonAdmin, tenantId, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('an administrator offboards many active members at once (status becomes SUSPENDED)', async () => {
    const result = await service.bulkOffboardMembers(tenantId, admin, { memberIds: [m1, m2], reason: 'Contract ended' });
    expect(result.offboarded).toBe(2);
    expect(result.ids.sort()).toEqual([m1, m2].sort());
    const statuses = await db.tenantMember.findMany({ where: { id: { in: [m1, m2] } }, select: { status: true } });
    expect(statuses.every((member) => member.status === 'SUSPENDED')).toBe(true);
  });

  it('skips the actor’s own membership and already-suspended members', async () => {
    const result = await service.bulkOffboardMembers(tenantId, admin, { memberIds: [mAdmin, m3], reason: 'No-op batch' });
    expect(result.offboarded).toBe(0);
    expect(result.ids).toEqual([]);
    const self = await db.tenantMember.findUniqueOrThrow({ where: { id: mAdmin }, select: { status: true } });
    expect(self.status).toBe('ACTIVE');
  });

  it('refuses a batch with an unknown member id and changes nothing', async () => {
    await expect(
      service.bulkOffboardMembers(tenantId, admin, { memberIds: [mNon, `ghost-${run}`], reason: 'Has a bad id' }),
    ).rejects.toMatchObject({ response: { code: 'OFFBOARD_UNKNOWN_MEMBER' } });
    const target = await db.tenantMember.findUniqueOrThrow({ where: { id: mNon }, select: { status: true } });
    expect(target.status).toBe('ACTIVE');
  });

  it('refuses a non-administrator actor', async () => {
    await expect(
      service.bulkOffboardMembers(tenantId, nonAdmin, { memberIds: [mNon], reason: 'Not allowed' }),
    ).rejects.toMatchObject({ response: { code: 'OFFBOARD_ADMIN_ONLY' } });
  });

  it('never suspends the last workspace administrator (whole batch rolls back)', async () => {
    // A Super Admin tries to suspend the sole Tenant Admin — the retention guard fires.
    await expect(
      service.bulkOffboardMembers(tenantId, sup, { memberIds: [mAdmin], reason: 'Would strand the workspace' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('last active tenant administrator') });
    const stillAdmin = await db.tenantMember.findUniqueOrThrow({ where: { id: mAdmin }, select: { status: true } });
    expect(stillAdmin.status).toBe('ACTIVE');
  });
});
