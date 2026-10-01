import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrganizationService as OrganizationServiceType } from './organization.service.js';

// WI-OI-109c: the organization service end to end on PostgreSQL 16 with the real migration, forced RLS and triggers.
// Runs only against the throwaway proof database (it must hold `org_proof_marker`); skipped without the URL.
const databaseUrl = process.env.ORG_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

const run = randomUUID().slice(0, 8);
const A = `org-svc-a-${run}`;
const B = `org-svc-b-${run}`;
const author = `author-${run}`;
const checker = `checker-${run}`;
const member = `member-${run}`;
const outsider = `outsider-${run}`;

integration('organization service', () => {
  let service: OrganizationServiceType;
  let db: typeof import('@gigalibs/db').prisma;
  const ids = { tree: '', company: '', north: '', south: '', store1: '', store2: '', spare: '', v1: '', v2: '', grant: '' };

  const expectStatus = async (promise: Promise<unknown>, status: number, message?: RegExp) => {
    const error = await promise.then(
      () => undefined,
      (caught: unknown) => caught as { getStatus?: () => number; message?: string },
    );
    expect(error, 'expected a refusal').toBeDefined();
    expect(error?.getStatus?.()).toBe(status);
    if (message) expect(error?.message).toMatch(message);
  };
  const lock = async (versionId: string) => (await service.getVersion(A, versionId)).lockVersion;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const marker = await db.$queryRawUnsafe<Array<{ n: number }>>('SELECT count(*)::int AS n FROM org_proof_marker');
    if (marker[0]?.n !== 1) throw new Error('Refusing to run: not the throwaway proof database.');
    service = new (await import('./organization.service.js')).OrganizationService();
    for (const tenantId of [A, B]) await db.$executeRaw`INSERT INTO tenants (id, slug, name, "updatedAt") VALUES (${tenantId}, ${tenantId}, ${tenantId}, now())`;
    for (const userId of [author, checker, member, outsider])
      await db.$executeRaw`INSERT INTO users (id, email, name, "updatedAt") VALUES (${userId}, ${`${userId}@example.invalid`}, ${userId}, now())`;
    for (const [userId, tenantId] of [[author, A], [checker, A], [member, A], [outsider, B]] as const)
      await db.$executeRaw`INSERT INTO tenant_members (id, "userId", "tenantId", "updatedAt") VALUES (${randomUUID()}, ${userId}, ${tenantId}, now())`;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('configures levels and units without code, refusing what breaks the rules', async () => {
    const company = await service.createUnitType(A, author, {
      code: 'COMPANY', labels: { one: 'Company', other: 'Companies' }, holdsRecords: false, capabilities: ['LEGAL_ENTITY'], allowAsRoot: true,
    });
    await service.createUnitType(A, author, { code: 'REGION', labels: { one: 'Region', other: 'Regions' }, holdsRecords: false, allowedParentTypeCodes: ['COMPANY'] });
    await service.createUnitType(A, author, { code: 'STORE', labels: { one: 'Store', other: 'Stores' }, holdsRecords: true, capabilities: ['OPERATIONAL'], allowedParentTypeCodes: ['REGION'] });
    await expectStatus(service.createUnitType(A, author, { code: 'STORE', labels: { one: 'x', other: 'x' }, holdsRecords: true, allowAsRoot: true }), 409);
    await expectStatus(service.createUnitType(A, author, { code: 'KIOSK', labels: { one: 'x', other: 'x' }, holdsRecords: true, allowedParentTypeCodes: ['MALL'] }), 422, /MALL/);
    await expectStatus(service.updateUnitType(A, author, company.id, { expectedVersion: 7, description: 'x', reason: 'stale write' }), 409);

    const legal = { legalName: 'FreshMart Retail Private Limited', country: 'IN', functionalCurrency: 'INR' };
    ids.company = (await service.createUnit(A, author, { typeCode: 'COMPANY', code: 'FRESHMART', name: 'FreshMart Group', effectiveFrom: '2026-10-01', legal })).id;
    ids.north = (await service.createUnit(A, author, { typeCode: 'REGION', code: 'NORTH', name: 'North', effectiveFrom: '2026-10-01' })).id;
    ids.south = (await service.createUnit(A, author, { typeCode: 'REGION', code: 'SOUTH', name: 'South', effectiveFrom: '2026-10-01' })).id;
    ids.store1 = (await service.createUnit(A, author, { typeCode: 'STORE', code: 'S-101', name: 'Store 101', effectiveFrom: '2026-10-01', managerUserId: member })).id;
    ids.store2 = (await service.createUnit(A, author, { typeCode: 'STORE', code: 'S-102', name: 'Store 102', effectiveFrom: '2026-10-01' })).id;
    ids.spare = (await service.createUnit(A, author, { typeCode: 'STORE', code: 'S-999', name: 'Never opened', effectiveFrom: '2026-10-01' })).id;
    await expectStatus(service.createUnit(A, author, { typeCode: 'STORE', code: 'S-103', name: 'x', effectiveFrom: '2026-10-01', legal }), 422, /not a legal entity/);
    await expectStatus(service.createUnit(A, author, { typeCode: 'STORE', code: 'S-104', name: 'x', effectiveFrom: '2026-10-01', managerUserId: outsider }), 422, /active member/);
    await expectStatus(service.createUnit(A, author, { typeCode: 'STORE', code: 'S-101', name: 'x', effectiveFrom: '2026-10-01' }), 409);

    const firstPage = await service.listUnits(A, { typeCode: 'STORE', limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    const secondPage = await service.listUnits(A, { typeCode: 'STORE', limit: 2, cursor: firstPage.nextCursor ?? undefined });
    expect(secondPage.items.map((unit) => unit.code)).toHaveLength(1);
    expect((await service.listUnits(A, { q: 'store 10', limit: 50 })).items.map((unit) => unit.code).sort()).toEqual(['S-101', 'S-102']);
    // Tenant B sees none of it.
    expect((await service.listUnits(B, { limit: 50 })).items).toEqual([]);
    await expectStatus(service.getUnit(B, ids.company), 404);
  });

  it('builds, validates and gets a second person to approve the first version', async () => {
    ids.tree = (await service.createTree(A, author, { code: 'primary', name: 'Organization', kind: 'PRIMARY', purpose: 'AUTHORITY' })).id;
    await expectStatus(service.createTree(A, author, { code: 'second', name: 'x', kind: 'PRIMARY', purpose: 'AUTHORITY' }), 409, /one primary tree/);
    const draft = await service.createDraft(A, author, ids.tree, {});
    ids.v1 = draft.id;
    expect(draft.basedOnVersionId).toBeNull();
    await expectStatus(service.createDraft(A, author, ids.tree, {}), 409, /open draft/);
    await expectStatus(service.updateEdges(A, author, ids.v1, { expectedVersion: 1, upsert: [{ unitId: ids.store1, parentUnitId: ids.north, sortOrder: 0 }], remove: [] }), 422, /parent/);
    await service.updateEdges(A, author, ids.v1, {
      expectedVersion: 1,
      upsert: [
        { unitId: ids.company, parentUnitId: null, sortOrder: 0 },
        { unitId: ids.north, parentUnitId: ids.company, sortOrder: 0 },
        { unitId: ids.store1, parentUnitId: ids.north, sortOrder: 0 },
        { unitId: ids.store2, parentUnitId: ids.north, sortOrder: 1 },
      ],
      remove: [],
    });
    await expectStatus(service.updateEdges(A, author, ids.v1, { expectedVersion: 1, upsert: [], remove: [ids.store2] }), 409, /changed/);
    const roots = await service.listEdges(A, ids.v1, { limit: 200 });
    expect(roots.items).toEqual([expect.objectContaining({ unitId: ids.company, typeCode: 'COMPANY', childCount: 1 })]);
    const children = await service.listEdges(A, ids.v1, { parentUnitId: ids.north, limit: 1 });
    expect(children.items.map((edge) => edge.unitId)).toEqual([ids.store1]);
    const rest = await service.listEdges(A, ids.v1, { parentUnitId: ids.north, limit: 1, cursor: children.nextCursor ?? undefined });
    expect(rest).toEqual({ items: [expect.objectContaining({ unitId: ids.store2 })], nextCursor: null });

    const checked = await service.validate(A, author, ids.v1, { expectedVersion: await lock(ids.v1) });
    expect(checked).toMatchObject({ valid: true, status: 'VALIDATED', problems: [] });
    await service.submit(A, author, ids.v1, { expectedVersion: checked.lockVersion, reason: 'First structure' });
    await expectStatus(service.updateEdges(A, author, ids.v1, { expectedVersion: await lock(ids.v1), upsert: [], remove: [ids.store2] }), 409, /open draft/);
    await expectStatus(service.approve(A, author, ids.v1, { expectedVersion: await lock(ids.v1), reason: 'self approval' }), 403, /second person/);
    await service.approve(A, checker, ids.v1, { expectedVersion: await lock(ids.v1), reason: 'Checked against the store list' });
    const published = await service.publish(A, author, ids.v1, { expectedVersion: await lock(ids.v1), reason: 'Go live' });
    expect(published).toMatchObject({ status: 'PUBLISHED', approvedBy: checker });
    expect(published.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    const closure = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM org_hierarchy_closure WHERE "versionId" = ${ids.v1}`;
    expect(closure[0]?.n).toBe(4 + 3 + 2); // self rows, parents, grandparents
  });

  it('activates idempotently from a moment, never in the past, and answers as of a time', async () => {
    const before = new Date().toISOString();
    await expectStatus(service.getActive(A, ids.tree, {}), 404);
    await expectStatus(
      service.activate(A, author, { versionId: ids.v1, effectiveFrom: '2026-01-01T00:00:00.000Z', reason: 'backdated', idempotencyKey: `past-${run}` }),
      422,
      /never rewritten/,
    );
    const request = { versionId: ids.v1, reason: 'Go live', idempotencyKey: `activate-${run}` };
    const first = await service.activate(A, author, request);
    expect(await service.activate(A, author, request)).toEqual(first);
    await expectStatus(service.activate(A, author, { ...request, reason: 'different' }), 409, /idempotency key/);
    expect((await service.getActive(A, ids.tree, {})).version.id).toBe(ids.v1);
    await expectStatus(service.getActive(A, ids.tree, { asOf: before }), 404);
    const events = await db.$queryRaw<Array<{ payload: { versionId: string; checksum: string } }>>`
      SELECT payload FROM platform_outbox_events WHERE "tenantId" = ${A} AND "eventType" = 'organization.hierarchy.activated.v1'`;
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.versionId).toBe(ids.v1);
  });

  it('grants a member a unit, once, and only a member of the tenant', async () => {
    const grant = await service.createGrant(A, author, { userId: member, unitId: ids.north, access: 'READ_WRITE', reason: 'Regional manager', idempotencyKey: `grant-${run}-1` });
    ids.grant = grant.id;
    await expectStatus(service.createGrant(A, author, { userId: member, unitId: ids.north, access: 'READ', reason: 'again', idempotencyKey: `grant-${run}-2` }), 409, /already holds/);
    await expectStatus(service.createGrant(A, author, { userId: outsider, unitId: ids.north, access: 'READ', reason: 'other tenant', idempotencyKey: `grant-${run}-3` }), 422, /active member/);
    expect((await service.listGrants(A, { userId: member, includeRevoked: false, limit: 100 })).items.map((item) => item.id)).toEqual([grant.id]);
    expect((await service.listGrants(B, { includeRevoked: true, limit: 100 })).items).toEqual([]);
  });

  it('previews what the next version changes, including whose access moves', async () => {
    const draft = await service.createDraft(A, author, ids.tree, { reason: 'Open the South region' });
    ids.v2 = draft.id;
    expect(draft.basedOnVersionId).toBe(ids.v1);
    expect((await service.getVersion(A, ids.v2)).unitCount).toBe(4);
    await expectStatus(service.updateEdges(A, author, ids.v2, { expectedVersion: draft.lockVersion, upsert: [], remove: [ids.north] }), 422, /children first/);
    await service.updateEdges(A, author, ids.v2, {
      expectedVersion: draft.lockVersion,
      upsert: [
        { unitId: ids.south, parentUnitId: ids.company, sortOrder: 1 },
        { unitId: ids.store2, parentUnitId: ids.south, sortOrder: 0 },
      ],
      remove: [ids.store1],
    });
    const impact = await service.impact(A, ids.v2);
    expect(impact).toMatchObject({
      comparedWithVersionId: ids.v1,
      totals: { added: 1, removed: 1, moved: 1, affectedGrants: 1 },
      added: [ids.south],
      removed: [ids.store1],
      moved: [{ unitId: ids.store2, fromParentUnitId: ids.north, toParentUnitId: ids.south }],
      affectedGrants: [expect.objectContaining({ grantId: ids.grant, userId: member })],
    });
  });

  it('reports rule breaches instead of validating, and lets the author withdraw', async () => {
    await service.updateEdges(A, author, ids.v2, { expectedVersion: await lock(ids.v2), upsert: [{ unitId: ids.store2, parentUnitId: null, sortOrder: 9 }], remove: [] });
    const checked = await service.validate(A, author, ids.v2, { expectedVersion: await lock(ids.v2) });
    expect(checked).toMatchObject({ valid: false, status: 'DRAFT' });
    expect(checked.problems).toEqual([expect.objectContaining({ code: 'ROOT_NOT_ALLOWED', unitId: ids.store2 })]);
    await expectStatus(service.submit(A, author, ids.v2, { expectedVersion: checked.lockVersion, reason: 'not validated' }), 409, /validated/);
    const withdrawn = await service.withdraw(A, author, ids.v2, { expectedVersion: checked.lockVersion, reason: 'Start again' });
    expect(withdrawn.status).toBe('REJECTED');
  });

  it('archives only units outside every live or open version, and never places archived units', async () => {
    const north = await service.getUnit(A, ids.north);
    await expectStatus(service.setUnitArchived(A, author, ids.north, true, { expectedVersion: north.version, reason: 'closing' }), 409, /placed/);
    const spare = await service.setUnitArchived(A, author, ids.spare, true, { expectedVersion: 1, reason: 'Never opened' });
    expect(spare.status).toBe('ARCHIVED');
    const draft = await service.createDraft(A, author, ids.tree, {});
    await expectStatus(service.updateEdges(A, author, draft.id, { expectedVersion: draft.lockVersion, upsert: [{ unitId: ids.spare, parentUnitId: ids.north, sortOrder: 5 }], remove: [] }), 422, /Archived/);
    // A whole branch leaves in one change.
    const pruned = await service.updateEdges(A, author, draft.id, { expectedVersion: draft.lockVersion, upsert: [], remove: [ids.north, ids.store1, ids.store2] });
    expect((await service.getVersion(A, draft.id)).unitCount).toBe(1);
    await service.withdraw(A, author, draft.id, { expectedVersion: pruned.lockVersion, reason: 'Not needed' });
    const restored = await service.setUnitArchived(A, author, ids.spare, false, { expectedVersion: spare.version, reason: 'Opening after all' });
    expect(restored.status).toBe('ACTIVE');
  });

  it('revokes once, and records every change in the audit log and outbox', async () => {
    const revoked = await service.revokeGrant(A, author, ids.grant, { reason: 'Moved to another region' });
    expect(revoked.revokedAt).not.toBeNull();
    await expectStatus(service.revokeGrant(A, author, ids.grant, { reason: 'twice' }), 409, /already revoked/);
    await expectStatus(service.revokeGrant(B, author, ids.grant, { reason: 'other tenant' }), 404);
    const audit = await db.$queryRaw<Array<{ resource: string; n: number }>>`
      SELECT resource, count(*)::int AS n FROM audit_logs WHERE "tenantId" = ${A} GROUP BY resource ORDER BY resource`;
    expect(Object.fromEntries(audit.map((row) => [row.resource, row.n]))).toMatchObject({
      'organization-unit-type': 3,
      'organization-tree': 1,
      'organization-hierarchy-activation': 1,
      'organization-scope-grant': 2,
    });
    const events = await db.$queryRaw<Array<{ eventType: string; n: number }>>`
      SELECT "eventType", count(*)::int AS n FROM platform_outbox_events WHERE "tenantId" = ${A} GROUP BY "eventType" ORDER BY 1`;
    expect(Object.fromEntries(events.map((row) => [row.eventType, row.n]))).toEqual({
      'organization.hierarchy.activated.v1': 1,
      'organization.scope-grant.changed.v1': 2,
      'organization.unit-type.changed.v1': 3,
      'organization.unit.changed.v1': 8,
    });
  });
});
