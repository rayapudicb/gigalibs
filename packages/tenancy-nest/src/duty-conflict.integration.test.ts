/**
 * WI-OI-120hp (R3): segregation-of-duties enforcement against a real control database. Runs only against the
 * throwaway `r3r4_proof` database; skipped without R3R4_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoDutyConflict } from './role-scopes.js';

const databaseUrl = process.env.R3R4_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r3r4_proof') throw new Error('Refusing: only the r3r4_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R3 duty-conflict enforcement (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-r3-${run}`;
  const userId = `u-r3-${run}`;
  const adminId = `admin-r3-${run}`;
  let db: typeof import('@gigalibs/db').prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R3 proof' } });
    await db.user.createMany({
      data: [
        { id: userId, email: `${userId}@r3.invalid`, name: 'Tech' },
        { id: adminId, email: `${adminId}@r3.invalid`, name: 'Admin' },
      ],
    });
    await db.tenantMember.create({ data: { id: `m-${run}`, userId, tenantId, role: 'MEMBER' } });
    await db.customRole.createMany({
      data: [
        { id: `requester-${run}`, tenantId, name: 'Absence requester', permissions: ['workforce.absences.request'], isSystem: true },
        { id: `approver-${run}`, tenantId, name: 'Absence approver', permissions: ['workforce.absences.approve'], isSystem: true },
      ],
    });
    // The member already holds the requester role.
    await db.memberRoleAssignment.create({
      data: { tenantId, userId, customRoleId: `requester-${run}`, scope: 'MEMBER', reason: 'R3 proof', grantedById: adminId },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('allows a change that keeps the member on one side only', async () => {
    await expect(assertNoDutyConflict(db, tenantId, userId, [])).resolves.toBeUndefined();
  });

  it('refuses giving the approver side to someone who already requests', async () => {
    await expect(assertNoDutyConflict(db, tenantId, userId, ['workforce.absences.approve'])).rejects.toMatchObject({
      response: { code: 'DUTY_CONFLICT', conflicts: ['workforce-absence-request-approve'] },
    });
  });

  it('allows it once an administrator accepts the conflict, and re-blocks when the acceptance is revoked', async () => {
    const acceptance = await db.dutyConflictAcceptance.create({
      data: { tenantId, userId, conflictSetId: 'workforce-absence-request-approve', reason: 'Two-person team', acceptedById: adminId },
    });
    await expect(assertNoDutyConflict(db, tenantId, userId, ['workforce.absences.approve'])).resolves.toBeUndefined();

    await db.dutyConflictAcceptance.update({
      where: { id: acceptance.id },
      data: { revokedAt: new Date(), revokedById: adminId, revokeReason: 'No longer needed' },
    });
    await expect(assertNoDutyConflict(db, tenantId, userId, ['workforce.absences.approve'])).rejects.toMatchObject({
      response: { code: 'DUTY_CONFLICT' },
    });
  });
});
