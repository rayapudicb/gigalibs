/**
 * WI-OI-120p slice 4 (R13): DB-backed delegated people-add authorization against a real control database. Runs only
 * against the throwaway `r13_proof` database; skipped without R13_TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorizeDelegatedPeopleAdd } from './people-admin.js';

const databaseUrl = process.env.R13_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r13_proof') throw new Error('Refusing: only the r13_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R13 delegated people-add authorization (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-r13-${run}`;
  const head = `head-${run}`;
  const tech = `maint-tech-${run}`;
  const planner = `maint-planner-${run}`;
  const financeApprover = `finance-approver-${run}`;
  let db: typeof import('@gigalibs/db').prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'R13 proof' } });
    await db.user.create({ data: { id: head, email: `${head}@r13.invalid`, name: 'Head' } });
    await db.tenantMember.create({ data: { id: `m-${run}`, userId: head, tenantId, role: 'MEMBER' } });
    await db.customRole.createMany({
      data: [
        { id: tech, tenantId, name: 'Maintenance technician', permissions: ['cmms:read'], isSystem: true },
        { id: planner, tenantId, name: 'Maintenance planner', permissions: ['cmms.work-orders.write'], isSystem: true },
        { id: financeApprover, tenantId, name: 'Finance approver', permissions: ['finance:journals:post'], isSystem: true },
      ],
    });
    // The head holds tech + planner (not finance-approver).
    await db.memberRoleAssignment.createMany({
      data: [
        { tenantId, userId: head, customRoleId: tech, scope: 'WORKSPACE', reason: 'R13 proof', grantedById: head },
        { tenantId, userId: head, customRoleId: planner, scope: 'WORKSPACE', reason: 'R13 proof', grantedById: head },
      ],
    });
    // North allows tech + planner.
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

  const add = (headUnits: string[], request: { unit: string; roleIds: string[]; baseRole?: string }) =>
    authorizeDelegatedPeopleAdd(db, tenantId, head, headUnits, request);

  it('allows an allowed, held role into a managed unit', async () => {
    expect(await add(['north'], { unit: 'north', roleIds: [tech] })).toEqual({ ok: true });
    expect(await add(['north'], { unit: 'north', roleIds: [tech, planner], baseRole: 'MEMBER' })).toEqual({ ok: true });
  });

  it('refuses a unit the head does not manage', async () => {
    expect(await add(['north'], { unit: 'south', roleIds: [tech] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_OUT_OF_UNIT' });
  });

  it("refuses a role not on the unit's allowance", async () => {
    expect(await add(['north'], { unit: 'north', roleIds: [financeApprover] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_ROLE_NOT_ALLOWED' });
  });

  it('refuses a role the head does not hold, even once it is allowed', async () => {
    await db.departmentRoleAllowance.create({ data: { tenantId, unitId: 'north', customRoleId: financeApprover, createdById: 'admin' } });
    expect(await add(['north'], { unit: 'north', roleIds: [financeApprover] })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_ESCALATION' });
  });

  it('refuses a base role above MEMBER', async () => {
    expect(await add(['north'], { unit: 'north', roleIds: [tech], baseRole: 'TENANT_ADMIN' })).toMatchObject({ ok: false, code: 'PEOPLE_ADMIN_NO_BASE_ROLE' });
  });
});
