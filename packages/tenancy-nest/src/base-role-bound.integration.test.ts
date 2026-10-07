import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120x: someone who is not a Tenant Admin gives no base role beyond what they hold, and does not change their own
// access; an invitation is checked again when it is accepted. Runs only against the throwaway `r2_proof` database
// (127.0.0.1:55433); skipped without R2_TEST_DATABASE_URL.
const databaseUrl = process.env.R2_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r2_proof') throw new Error('Refusing: only the r2_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('base-role bound (isolated PostgreSQL)', () => {
  const run = Date.now().toString(36);
  const tenantId = `t-120x-${run}`;
  const admin = `admin-${run}`;
  const lead = `lead-${run}`;
  const worker = `worker-${run}`;
  const newcomer = `new-${run}`;
  let db: typeof import('@gigalibs/db').prisma;
  let service: import('./tenancy.service.js').TenancyService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    service = new (await import('./tenancy.service.js')).TenancyService();
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'WI-OI-120x', status: 'ACTIVE' } });
    await db.user.createMany({ data: [admin, lead, worker, newcomer].map((id) => ({ id, email: `${id}@r2x.invalid`, name: id, status: 'ACTIVE' as const })) });
    await db.tenantMember.createMany({
      data: [
        { id: `m-admin-${run}`, userId: admin, tenantId, role: 'TENANT_ADMIN' },
        // A Member who manages people: `users:update` and `invites:create` given directly.
        { id: `m-lead-${run}`, userId: lead, tenantId, role: 'MEMBER', permissions: ['users:update', 'invites:create'] },
        { id: `m-worker-${run}`, userId: worker, tenantId, role: 'VIEWER' },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'OK',
      (error: { getResponse?: () => unknown }) => (error.getResponse?.() as { code?: string } | undefined)?.code ?? String(error),
    );
  const update = async (memberId: string, actorId: string, changes: Record<string, unknown>) => {
    const member = await db.tenantMember.findUniqueOrThrow({ where: { id: memberId } });
    return service.updateMember(tenantId, memberId, actorId, { expectedUpdatedAt: member.updatedAt.toISOString(), reason: 'Team change', ...changes } as never);
  };
  const roleOf = async (memberId: string) => (await db.tenantMember.findUniqueOrThrow({ where: { id: memberId } })).role;

  it('gives a base role only within what a non-admin holds, and lets them lower one', async () => {
    expect(await code(update(`m-worker-${run}`, lead, { role: 'MANAGER' }))).toBe('GRANT_BEYOND_OWN');
    expect(await roleOf(`m-worker-${run}`)).toBe('VIEWER');
    expect(await code(update(`m-worker-${run}`, lead, { role: 'MEMBER' }))).toBe('OK');
    expect(await code(update(`m-worker-${run}`, lead, { role: 'VIEWER' }))).toBe('OK');
    expect(await code(update(`m-worker-${run}`, admin, { role: 'MANAGER' }))).toBe('OK');
  });

  it('refuses a non-admin changing their own role or places; an admin may change their own', async () => {
    expect(await code(update(`m-lead-${run}`, lead, { role: 'VIEWER' }))).toBe('SELF_ACCESS_CHANGE');
    expect(await code(update(`m-lead-${run}`, lead, { spatialScopePlaceIds: ['place-1'] }))).toBe('SELF_ACCESS_CHANGE');
    expect(await code(update(`m-lead-${run}`, lead, { employmentType: 'CONTRACTOR' }))).toBe('OK');
    expect(await code(update(`m-admin-${run}`, admin, { spatialScopePlaceIds: ['place-1'] }))).toBe('OK');
  });

  it('refuses an invitation beyond its sender, and checks it again when it is accepted', async () => {
    expect(await code(service.createInvite(tenantId, lead, { email: `${newcomer}@r2x.invalid`, role: 'MANAGER', expiresInHours: 72 }))).toBe('GRANT_BEYOND_OWN');
    const invitation = await service.createInvite(tenantId, lead, { email: `${newcomer}@r2x.invalid`, role: 'MEMBER', expiresInHours: 72 });
    // The sender is lowered to Viewer before the invitation is accepted: they no longer hold what Member gives.
    expect(await code(update(`m-lead-${run}`, admin, { role: 'VIEWER' }))).toBe('OK');
    expect(await code(service.acceptInvite(newcomer, { token: invitation.token }))).toBe('INVITATION_NO_LONGER_VALID');
    expect(await db.tenantMember.findUnique({ where: { userId_tenantId: { userId: newcomer, tenantId } } })).toBeNull();
    expect((await db.tenantInvite.findFirstOrThrow({ where: { tenantId, email: `${newcomer}@r2x.invalid`, revokedAt: null } })).acceptedAt).toBeNull();
  });
});
