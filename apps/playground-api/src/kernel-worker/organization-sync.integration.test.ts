import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { OrgReplicaCompletionV1Schema, OrgReplicaPageV1Schema } from '@gigalibs/contracts';
import {
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  OrganizationReplica,
  organizationReplicaDdl,
  OrganizationVersionPendingError,
} from '@gigalibs/module-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-109e2 end to end on the throwaway proof database: the control plane publishes and activates a version; the
// relay's sync service queues a job; the kernel job reads the version and sends it, signed, page by page; the shared
// module replica (here in a test schema, under forced RLS as a runtime role) checks it against the control plane's
// checksum and expands grant roots. Skipped without ORG_TEST_DATABASE_URL.
const databaseUrl = process.env.ORG_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

const run = randomUUID().slice(0, 8);
const A = `org-sync-a-${run}`;
const B = `org-sync-b-${run}`;
const author = `sync-author-${run}`;
const checker = `sync-checker-${run}`;
const SCHEMA = `replica_proof_${run}`;
const ROLE = `replica_runtime_${run}`;

integration('organization version delivery to a module', () => {
  let db: typeof import('@gigalibs/db').prisma;
  let pool: pg.Pool;
  const replica = new OrganizationReplica(SCHEMA);
  const ids = { company: '', north: '', storeA: '', storeB: '', version: '', activation: '' };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  /** A module request: the tenant transaction as the module's runtime role, as the module's database helper runs it. */
  const asModule = async <T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${ROLE}`);
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(48);
    process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
    process.env.JWT_REFRESH_EXPIRES_IN ??= '30d';
    ({ prisma: db } = await import('@gigalibs/db'));
    const marker = await db.$queryRawUnsafe<Array<{ n: number }>>('SELECT count(*)::int AS n FROM org_proof_marker');
    if (marker[0]?.n !== 1) throw new Error('Refusing to run: not the throwaway proof database.');
    pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    await pool.query(organizationReplicaDdl(SCHEMA));
    await pool.query(`CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO ${ROLE}; GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ${SCHEMA} TO ${ROLE}`);
    for (const tenantId of [A, B])
      await db.tenant.create({
        data: { id: tenantId, slug: tenantId, name: tenantId, settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } },
      });
    for (const userId of [author, checker]) {
      await db.$executeRaw`INSERT INTO users (id, email, name, status, "updatedAt") VALUES (${userId}, ${`${userId}@example.invalid`}, ${userId}, 'ACTIVE', now())`;
      await db.$executeRaw`INSERT INTO tenant_members (id, "userId", "tenantId", role, "updatedAt") VALUES (${randomUUID()}, ${userId}, ${A}, 'TENANT_ADMIN', now())`;
    }
    await db.$executeRaw`INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleKey", status, source, reason, "updatedById", "updatedAt")
      VALUES (${randomUUID()}, ${A}, 'gigaops', 'ENABLED', 'PLATFORM_OVERRIDE', 'WI-OI-109e2 proof', ${author}, now())`;

    const { OrganizationService } = await import('@gigalibs/tenancy-nest');
    const organization = new OrganizationService();
    await organization.createUnitType(A, author, { code: 'COMPANY', labels: { one: 'Company', other: 'Companies' }, holdsRecords: false, allowAsRoot: true });
    await organization.createUnitType(A, author, { code: 'REGION', labels: { one: 'Region', other: 'Regions' }, holdsRecords: false, allowedParentTypeCodes: ['COMPANY'] });
    await organization.createUnitType(A, author, { code: 'STORE', labels: { one: 'Store', other: 'Stores' }, holdsRecords: true, allowedParentTypeCodes: ['REGION'] });
    // Mixed-case and punctuated codes and ids exercise the byte-order checksum on both sides.
    ids.company = (await organization.createUnit(A, author, { typeCode: 'COMPANY', code: 'Fresh-Mart', name: 'FreshMart', effectiveFrom: '2026-10-01' })).id;
    ids.north = (await organization.createUnit(A, author, { typeCode: 'REGION', code: 'north', name: 'North', effectiveFrom: '2026-10-01' })).id;
    ids.storeA = (await organization.createUnit(A, author, { typeCode: 'STORE', code: 'S.101', name: 'Store 101', effectiveFrom: '2026-10-01' })).id;
    ids.storeB = (await organization.createUnit(A, author, { typeCode: 'STORE', code: 's-102', name: 'Store 102', effectiveFrom: '2026-10-01' })).id;
    const tree = await organization.createTree(A, author, { code: 'primary', name: 'Organization', kind: 'PRIMARY', purpose: 'AUTHORITY' });
    const draft = await organization.createDraft(A, author, tree.id, {});
    ids.version = draft.id;
    await organization.updateEdges(A, author, draft.id, {
      expectedVersion: draft.lockVersion,
      upsert: [
        { unitId: ids.company, parentUnitId: null, sortOrder: 0 },
        { unitId: ids.north, parentUnitId: ids.company, sortOrder: 0 },
        { unitId: ids.storeA, parentUnitId: ids.north, sortOrder: 1 },
        { unitId: ids.storeB, parentUnitId: ids.north, sortOrder: 2 },
      ],
      remove: [],
    });
    const lock = async () => (await organization.getVersion(A, draft.id)).lockVersion;
    await organization.validate(A, author, draft.id, { expectedVersion: await lock() });
    await organization.submit(A, author, draft.id, { expectedVersion: await lock(), reason: 'Delivery proof' });
    await organization.approve(A, checker, draft.id, { expectedVersion: await lock(), reason: 'Checked' });
    await organization.publish(A, author, draft.id, { expectedVersion: await lock(), reason: 'Publish' });
    ids.activation = (await organization.activate(A, author, { versionId: draft.id, reason: 'Go live', idempotencyKey: `sync-${run}` })).id;
  });

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await pool?.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
    await pool?.end();
    await db?.$disconnect();
  });

  it('queues one job per entitled module from the activation event, once', async () => {
    const { KernelOrganizationSyncService } = await import('../kernel-organization-sync.service.js');
    const { AuthService } = await import('@gigalibs/auth-nest');
    const queued: unknown[] = [];
    const sync = new KernelOrganizationSyncService(new AuthService(), { enqueue: async (command) => (queued.push(command), { id: `job-${queued.length}` }) as never });
    const [event] = await db.$queryRaw<Array<{ tenantId: string; eventType: string; payload: unknown }>>`
      SELECT "tenantId", "eventType", payload FROM platform_outbox_events WHERE "tenantId" = ${A} AND "eventType" = 'organization.hierarchy.activated.v1'`;
    expect(await sync.dispatch(event!)).toEqual([{ moduleKey: 'gigaops', jobId: 'job-1' }]);
    expect(queued[0]).toMatchObject({
      tenantId: A,
      payload: { operation: 'workforce.organization-sync', versionId: ids.version },
      ownerSubjectId: author,
      idempotencyKey: `organization-sync:activation:${ids.activation}:gigaops`,
    });
  });

  it('delivers the version signed, page by page; the module holds it only when count, parents and checksum agree', async () => {
    const { moduleCallJob, parseModuleCallPayload } = await import('./module-call.job.js');
    const { prismaOrganizationVersions } = await import('./organization-versions.js');
    const { AuthService } = await import('@gigalibs/auth-nest');
    const environment = {
      WORKFORCE_API_URL: 'http://workforce-api:4700',
      WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    } as NodeJS.ProcessEnv;
    // The module's two endpoints, in process: verify the signed context, then apply the shared replica.
    const moduleFetch = async (url: string, init: RequestInit) => {
      const claims = verifyPlatformContextToken(String((init.headers as Record<string, string>).Authorization).slice(7), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-workforce-api');
      const versionId = decodeURIComponent(url.split('/versions/')[1]!.split('/')[0]!);
      const body = JSON.parse(String(init.body));
      const result = url.endsWith('/complete')
        ? await asModule(claims.tenant_id, (client) => {
            const { unit_count, ...header } = OrgReplicaCompletionV1Schema.parse(body);
            return replica.complete(client, claims.tenant_id, versionId, header, unit_count);
          })
        : await asModule(claims.tenant_id, (client) => {
            const { units, page: _page, ...header } = OrgReplicaPageV1Schema.parse(body);
            return replica.receivePage(client, claims.tenant_id, versionId, header, units);
          });
      return new Response(JSON.stringify(result), { status: 200 });
    };
    const job = moduleCallJob(new AuthService(), environment, moduleFetch as never, undefined, undefined, prismaOrganizationVersions);
    const result = await job.handler({
      jobId: 'job-1', tenantId: A, ownerSubjectId: author, ownerAuthVersion: 1, correlationId: `organization:activation:${ids.activation}`, attempt: 1,
      payload: parseModuleCallPayload({ operation: 'workforce.organization-sync', versionId: ids.version }), signal: new AbortController().signal,
    } as never);
    expect(result).toMatchObject({ resultStatus: 'READY', units: 4 });
    expect(await asModule(A, (client) => replica.isReady(client, A, ids.version))).toBe(true);
    expect(await asModule(A, (client) => replica.expand(client, A, ids.version, [ids.north]))).toEqual([ids.north, ids.storeA, ids.storeB].sort());
    // Tenant B's transaction sees none of tenant A's copy.
    expect(await asModule(B, (client) => replica.isReady(client, B, ids.version))).toBe(false);
    const rows = await asModule(B, (client) => client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.org_replica_units`));
    expect(rows.rows[0]?.n).toBe(0);
    // Running the job again (a retry) changes nothing.
    expect(await job.handler({
      jobId: 'job-2', tenantId: A, ownerSubjectId: author, ownerAuthVersion: 1, correlationId: 'retry', attempt: 2,
      payload: parseModuleCallPayload({ operation: 'workforce.organization-sync', versionId: ids.version }), signal: new AbortController().signal,
    } as never)).toMatchObject({ resultStatus: 'READY' });
  });

  it('applies the same unit rules in module SQL: read by unit or shared, write by read-write unit, owners that hold records (WI-OI-109e3)', async () => {
    await pool.query(`CREATE TABLE ${SCHEMA}.records (tenant_id VARCHAR(64) NOT NULL, id TEXT NOT NULL, unit_id VARCHAR(64))`);
    await pool.query(`GRANT SELECT ON ${SCHEMA}.records TO ${ROLE}`);
    await pool.query(`INSERT INTO ${SCHEMA}.records VALUES ($1, 'company', $2), ($1, 'north', $3), ($1, 'store-a', $4), ($1, 'store-b', $5), ($1, 'shared', NULL), ($1, 'unknown', 'UNMATCHED')`, [
      A, ids.company, ids.north, ids.storeA, ids.storeB,
    ]);
    const visible = async (claim: Parameters<typeof organizationAccess>[3]) =>
      asModule(A, async (client) => {
        const access = await organizationAccess(replica, client, A, claim);
        const values: unknown[] = [A];
        const condition = organizationReadCondition(access, 'unit_id', (value) => `$${values.push(value)}`);
        const rows = await client.query<{ id: string }>(`SELECT id FROM ${SCHEMA}.records WHERE tenant_id = $1${condition ? ` AND ${condition}` : ''} ORDER BY id`, values);
        return { access, ids: rows.rows.map((row) => row.id) };
      });
    // A regional manager: read the region (and everything below), change only one store.
    const regional = await visible({ mode: 'UNITS', tree_version: ids.version, read_roots: [ids.north], write_roots: [ids.storeA] });
    expect(regional.ids).toEqual(['north', 'shared', 'store-a', 'store-b']);
    expect(() => assertOrganizationWrite(regional.access, ids.storeA)).not.toThrow();
    expect(() => assertOrganizationWrite(regional.access, ids.storeB)).toThrow(/outside your access/);
    expect(() => assertOrganizationWrite(regional.access, null)).toThrow(/tenant-wide authority/);
    // Tenant-wide: everything, including unmatched records; denied: nothing.
    expect((await visible({ mode: 'TENANT', tree_version: ids.version })).ids).toEqual(['company', 'north', 'shared', 'store-a', 'store-b', 'unknown']);
    expect((await visible({ mode: 'DENIED' })).ids).toEqual([]);
    // No grant: shared records only.
    expect((await visible({ mode: 'UNITS', tree_version: ids.version, read_roots: [], write_roots: [] })).ids).toEqual(['shared']);
    // Owners: a store holds records; the company and the region only group; an unknown unit is refused.
    await asModule(A, async (client) => {
      const access = await organizationAccess(replica, client, A, { mode: 'TENANT', tree_version: ids.version });
      await expect(assertOwningUnit(replica, client, A, access, 'EITHER', ids.storeA)).resolves.toBeUndefined();
      await expect(assertOwningUnit(replica, client, A, access, 'EITHER', ids.north)).rejects.toThrow(/does not hold records/);
      await expect(assertOwningUnit(replica, client, A, access, 'EITHER', 'no-such-unit')).rejects.toThrow(/not in the organization in force/);
      await expect(assertOwningUnit(replica, client, A, access, 'UNIT', null)).rejects.toThrow(/Choose the unit/);
      await expect(assertOwningUnit(replica, client, A, access, 'SHARED', ids.storeA)).rejects.toThrow(/shared across the tenant/);
    });
    // A context naming a version this module does not hold is refused, never answered more widely.
    await expect(asModule(A, (client) => organizationAccess(replica, client, A, { mode: 'UNITS', tree_version: 'not-here-yet', read_roots: [ids.north], write_roots: [] })))
      .rejects.toBeInstanceOf(OrganizationVersionPendingError);
  });

  it('matches records to units by code from the newest held primary version', async () => {
    const byCode = await asModule(A, (client) => replica.unitsByCode(client, A));
    expect(byCode.get('S.101')).toEqual({ id: ids.storeA, name: 'Store 101' });
    expect(byCode.get('north')).toEqual({ id: ids.north, name: 'North' });
    expect(await asModule(B, (client) => replica.unitsByCode(client, B))).toEqual(new Map());
  });

  it('refuses a version whose content contradicts the checksum, a missing parent, or a short count', async () => {
    const header = { tree_id: 'tree-x', tree_kind: 'PRIMARY' as const, version_number: 1, checksum: `sha256:${'0'.repeat(64)}` };
    const unit = { unit_id: 'u-1', parent_unit_id: null, code: 'U-1', name: 'Unit 1', sort_order: 0, status: 'ACTIVE' as const, holds_records: true, type_code: 'STORE' };
    await asModule(A, (client) => replica.receivePage(client, A, 'tampered', header, [unit]));
    await expect(asModule(A, (client) => replica.complete(client, A, 'tampered', header, 1))).rejects.toThrow(/checksum/);
    await expect(asModule(A, (client) => replica.complete(client, A, 'tampered', header, 2))).rejects.toThrow(/Expected 2 units/);
    await asModule(A, (client) => replica.receivePage(client, A, 'orphaned', header, [{ ...unit, parent_unit_id: 'nowhere' }]));
    await expect(asModule(A, (client) => replica.complete(client, A, 'orphaned', header, 1))).rejects.toThrow(/parent/);
    await expect(asModule(A, (client) => replica.receivePage(client, A, 'tampered', { ...header, version_number: 2 }, [unit]))).rejects.toThrow(/different content/);
    expect(await asModule(A, (client) => replica.isReady(client, A, 'tampered'))).toBe(false);
  });

  it('lets an administrator send the version in force again', async () => {
    const { OrganizationService } = await import('@gigalibs/tenancy-nest');
    const organization = new OrganizationService();
    const tree = (await organization.listTrees(A))[0]!;
    const request = await organization.requestSync(A, author, tree.id, { reason: 'A module was added' });
    expect(request.activations).toBe(1);
    const events = await db.$queryRaw<Array<{ payload: { versionId: string; requestedBy: string } }>>`
      SELECT payload FROM platform_outbox_events WHERE "tenantId" = ${A} AND "eventType" = 'organization.hierarchy.sync-requested.v1'`;
    expect(events).toEqual([expect.objectContaining({ payload: expect.objectContaining({ versionId: ids.version, requestedBy: author }) })]);
  });
});
