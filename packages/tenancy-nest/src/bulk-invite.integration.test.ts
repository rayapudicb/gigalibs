/**
 * WI-OI-120p slice 5 (R14): bulk delegated invite — a batch is all-or-nothing (every row is validated before anything
 * is created) and each created invite yields a one-time link for download. Runs only against the throwaway `r14_proof`
 * database; skipped without R14_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.R14_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r14_proof') throw new Error('Refusing: only the r14_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R14 bulk delegated invite (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-bulk-${run}`;
  const head = `head-${run}`;
  const member = `member-${run}`;
  const memberEmail = `member-${run}@bulk.invalid`;
  const peopleManager = `people-mgr-${run}`;
  const tech = `maint-tech-${run}`;
  const planner = `maint-planner-${run}`;
  const a1 = `a1-${run}@bulk.invalid`;
  const a2 = `a2-${run}@bulk.invalid`;
  const a3 = `a3-${run}@bulk.invalid`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: InstanceType<typeof import('./tenancy.service.js').TenancyService>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const { TenancyService } = await import('./tenancy.service.js');
    service = new TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Bulk invite proof', status: 'ACTIVE' } });
    await db.user.createMany({
      data: [
        { id: head, email: `${head}@bulk.invalid`, name: 'Head', status: 'ACTIVE' },
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
        { id: planner, tenantId, name: 'Maintenance planner', permissions: ['cmms:plan'], isSystem: true },
      ],
    });
    // The head holds people:manage scoped to North, and holds both roles (so may delegate them).
    await db.memberRoleAssignment.createMany({
      data: [
        { tenantId, userId: head, customRoleId: peopleManager, scope: 'UNITS', unitIds: ['north'], reason: 'proof', grantedById: head },
        { tenantId, userId: head, customRoleId: tech, scope: 'WORKSPACE', reason: 'proof', grantedById: head },
        { tenantId, userId: head, customRoleId: planner, scope: 'WORKSPACE', reason: 'proof', grantedById: head },
      ],
    });
    // North allows both roles.
    await db.departmentRoleAllowance.createMany({
      data: [
        { tenantId, unitId: 'north', customRoleId: tech, createdById: 'admin' },
        { tenantId, unitId: 'north', customRoleId: planner, createdById: 'admin' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('creates every invite in a valid batch, returns a one-time link each, and an accepted link grants the scoped role', async () => {
    const result = await service.bulkDelegatedInvite(tenantId, head, {
      rows: [
        { email: a1, unit: 'north', roleIds: [tech] },
        { email: a2, unit: 'north', roleIds: [tech, planner], name: 'A Two' },
      ],
      expiresInHours: 72,
    });
    expect(result.count).toBe(2);
    expect(result.invites.map((invite) => invite.email).sort()).toEqual([a1, a2].sort());
    expect(result.invites.every((invite) => typeof invite.token === 'string' && invite.token.length > 0)).toBe(true);

    const accepter = `acc1-${run}`;
    await db.user.create({ data: { id: accepter, email: a1, name: 'A One', status: 'ACTIVE' } });
    const inviteA1 = result.invites.find((invite) => invite.email === a1)!;
    await service.acceptInvite(accepter, { token: inviteA1.token });
    const assignments = await db.memberRoleAssignment.findMany({
      where: { tenantId, userId: accepter, revokedAt: null },
      select: { customRoleId: true, scope: true, unitIds: true },
    });
    expect(assignments).toEqual([{ customRoleId: tech, scope: 'UNITS', unitIds: ['north'] }]);
  });

  it('is all-or-nothing: an out-of-unit row and an already-member row abort the whole batch, creating no invites', async () => {
    const before = await db.tenantInvite.count({ where: { tenantId } });
    await expect(
      service.bulkDelegatedInvite(tenantId, head, {
        rows: [
          { email: `fresh-${run}@bulk.invalid`, unit: 'north', roleIds: [tech] }, // fine on its own
          { email: `south-${run}@bulk.invalid`, unit: 'south', roleIds: [tech] }, // out of the head's units
          { email: memberEmail, unit: 'north', roleIds: [tech] }, // already a member
        ],
        expiresInHours: 72,
      }),
    ).rejects.toMatchObject({ response: { code: 'BULK_VALIDATION_FAILED' } });
    const after = await db.tenantInvite.count({ where: { tenantId } });
    expect(after).toBe(before);
  });

  it('the join tracker lists the head’s delegated invites with a derived status and never a token', async () => {
    const { invites } = await service.listDelegatedInvites(tenantId, head);
    const byEmail = Object.fromEntries(invites.map((invite) => [invite.email, invite]));
    expect(byEmail[a1]?.status).toBe('ACCEPTED');
    expect(byEmail[a2]?.status).toBe('PENDING');
    expect(invites.every((invite) => !('token' in invite))).toBe(true);
    expect(invites.every((invite) => invite.unitId === 'north')).toBe(true);
  });

  it('bulk resend rotates a fresh one-time link for pending invites only (accepted ids are skipped), and the new link works', async () => {
    const tracked = (await service.listDelegatedInvites(tenantId, head)).invites;
    const a1Id = tracked.find((invite) => invite.email === a1)!.id;
    const a2Id = tracked.find((invite) => invite.email === a2)!.id;
    const result = await service.bulkResendDelegatedInvites(tenantId, head, { inviteIds: [a1Id, a2Id], expiresInHours: 48 });
    expect(result.count).toBe(1);
    expect(result.invites[0]!.id).toBe(a2Id); // a1 is already accepted → skipped
    expect(result.invites[0]!.email).toBe(a2);
    expect(result.invites[0]!.token).toBeTruthy();

    const accepter2 = `acc2-${run}`;
    await db.user.create({ data: { id: accepter2, email: a2, name: 'A Two', status: 'ACTIVE' } });
    await service.acceptInvite(accepter2, { token: result.invites[0]!.token });
    const assignments = await db.memberRoleAssignment.findMany({
      where: { tenantId, userId: accepter2, revokedAt: null },
      select: { customRoleId: true, scope: true, unitIds: true },
    });
    expect(assignments.map((assignment) => assignment.customRoleId).sort()).toEqual([planner, tech].sort());
    expect(assignments.every((assignment) => assignment.scope === 'UNITS' && assignment.unitIds.length === 1 && assignment.unitIds[0] === 'north')).toBe(true);
  });

  it('bulk revoke revokes only still-pending invites in the head’s units; accepted ids are skipped', async () => {
    const added = await service.bulkDelegatedInvite(tenantId, head, { rows: [{ email: a3, unit: 'north', roleIds: [tech] }], expiresInHours: 72 });
    expect(added.count).toBe(1);
    const a3Id = (await service.listDelegatedInvites(tenantId, head)).invites.find((invite) => invite.email === a3)!.id;
    const a1Id = (await service.listDelegatedInvites(tenantId, head)).invites.find((invite) => invite.email === a1)!.id;

    const result = await service.bulkRevokeDelegatedInvites(tenantId, head, { inviteIds: [a3Id, a1Id], expiresInHours: 72 });
    expect(result.revoked).toBe(1); // a1 is accepted → skipped
    expect(result.ids).toEqual([a3Id]);

    const a3Status = (await service.listDelegatedInvites(tenantId, head)).invites.find((invite) => invite.email === a3)!.status;
    expect(a3Status).toBe('REVOKED');
    // revoking again is a no-op (already revoked → skipped)
    expect((await service.bulkRevokeDelegatedInvites(tenantId, head, { inviteIds: [a3Id], expiresInHours: 72 })).revoked).toBe(0);
  });
});
