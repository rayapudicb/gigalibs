/**
 * WI-OI-120hq (R4): a delegated role assignment grants access only while live — the mint filter in memberRoleGrants.
 * Runs only against the throwaway `r3r4_proof` database; skipped without R3R4_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.R3R4_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r3r4_proof') throw new Error('Refusing: only the r3r4_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R4 delegation is minted only while live (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-r4-${run}`;
  const adminId = `admin-r4-${run}`;
  const roleId = `approver-r4-${run}`;
  const PERM = 'workforce.timesheets.approve';
  const DAY = 86_400_000;
  let db: typeof import('@gigalibs/db').prisma;
  let memberRoleGrants: typeof import('@gigalibs/rbac-nest').memberRoleGrants;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    ({ memberRoleGrants } = await import('@gigalibs/rbac-nest'));
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R4 proof' } });
    await db.user.create({ data: { id: adminId, email: `${adminId}@r4.invalid`, name: 'Admin' } });
    await db.customRole.create({ data: { id: roleId, tenantId, name: 'Timesheet approver', permissions: [PERM], isSystem: true } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Each scenario is its own member so memberRoleGrants' union stays clean.
  async function holdsApproveWith(suffix: string, bounds: { effectiveFrom?: Date; effectiveTo?: Date; revokedAt?: Date; delegated?: boolean }): Promise<boolean> {
    const userId = `u-${suffix}-${run}`;
    await db.user.create({ data: { id: userId, email: `${userId}@r4.invalid`, name: suffix } });
    await db.tenantMember.create({ data: { id: `m-${suffix}-${run}`, userId, tenantId, role: 'MEMBER' } });
    await db.memberRoleAssignment.create({
      data: {
        tenantId,
        userId,
        customRoleId: roleId,
        scope: 'WORKSPACE',
        reason: 'R4 proof',
        grantedById: adminId,
        ...(bounds.delegated ? { delegatedById: adminId } : {}),
        ...(bounds.effectiveFrom ? { effectiveFrom: bounds.effectiveFrom } : {}),
        ...(bounds.effectiveTo ? { effectiveTo: bounds.effectiveTo } : {}),
        ...(bounds.revokedAt ? { revokedAt: bounds.revokedAt, revokedById: adminId, revokeReason: 'test' } : {}),
      },
    });
    const { permissions } = await memberRoleGrants(db, tenantId, userId);
    return permissions.includes(PERM);
  }

  it('mints a delegation that is live now', async () => {
    expect(await holdsApproveWith('live', { delegated: true, effectiveFrom: new Date(Date.now() - DAY), effectiveTo: new Date(Date.now() + DAY) })).toBe(true);
  });

  it('does not mint a delegation that has not started', async () => {
    expect(await holdsApproveWith('future', { delegated: true, effectiveFrom: new Date(Date.now() + DAY), effectiveTo: new Date(Date.now() + 2 * DAY) })).toBe(false);
  });

  it('does not mint a delegation that has ended', async () => {
    expect(await holdsApproveWith('expired', { delegated: true, effectiveFrom: new Date(Date.now() - 2 * DAY), effectiveTo: new Date(Date.now() - DAY) })).toBe(false);
  });

  it('does not mint a revoked delegation', async () => {
    expect(await holdsApproveWith('revoked', { delegated: true, effectiveFrom: new Date(Date.now() - DAY), effectiveTo: new Date(Date.now() + DAY), revokedAt: new Date() })).toBe(false);
  });

  it('still mints an ordinary assignment with no bounds', async () => {
    expect(await holdsApproveWith('ordinary', {})).toBe(true);
  });
});
