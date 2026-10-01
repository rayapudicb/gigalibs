import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-109b (ADR-0018) on PostgreSQL 16 with the real migration, as the non-superuser gigalibs_org_tenant role under
// forced row-level security. The harness restores the core schema from a backup and applies the pending migration,
// so this is also the representative-upgrade evidence. Skipped without ORG_TEST_DATABASE_URL.
const databaseUrl = process.env.ORG_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

const run = randomUUID().slice(0, 8);
const A = `org-a-${run}`;
const B = `org-b-${run}`;
const authorA = `author-a-${run}`;
const checkerA = `checker-a-${run}`;
const memberB = `member-b-${run}`;

integration('organization hierarchy persistence', () => {
  let pool: pg.Pool;

  /** One transaction as the tenant role, with the tenant set (the control plane's pattern). */
  const asTenant = async <T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE gigalibs_org_tenant');
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
  const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12)}`;

  const typeRow = async (client: pg.PoolClient, tenantId: string, code: string, opts: { root?: boolean; parents?: string[]; holds?: boolean } = {}) => {
    const typeId = id('type');
    await client.query(
      `INSERT INTO org_unit_types (id, "tenantId", code, "labelOne", "labelOther", "holdsRecords", "allowedParentTypeCodes", "allowAsRoot", "createdById", "updatedById")
       VALUES ($1, $2, $3, $3, $3, $4, $5, $6, $7, $7)`,
      [typeId, tenantId, code, opts.holds ?? true, opts.parents ?? [], opts.root ?? false, authorA],
    );
    return typeId;
  };
  const unitRow = async (client: pg.PoolClient, tenantId: string, typeId: string, code: string) => {
    const unitId = id('unit');
    await client.query(
      `INSERT INTO org_units (id, "tenantId", "typeId", code, name, "effectiveFrom", "createdById", "updatedById")
       VALUES ($1, $2, $3, $4, $4, DATE '2026-10-01', $5, $5)`,
      [unitId, tenantId, typeId, code, authorA],
    );
    return unitId;
  };

  // A retail-shaped tenant A (Company → Region → Store) and a tenant B with one unit.
  const a = { tree: '', company: '', north: '', store: '', companyType: '', regionType: '', storeType: '' };
  let bUnit = '';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    const admin = await pool.connect();
    try {
      for (const [tenantId, slug] of [[A, A], [B, B]]) {
        await admin.query(`INSERT INTO tenants (id, slug, name, "updatedAt") VALUES ($1, $2, $2, now())`, [tenantId, slug]);
      }
      for (const userId of [authorA, checkerA, memberB]) {
        await admin.query(`INSERT INTO users (id, email, name, "updatedAt") VALUES ($1, $1 || '@example.invalid', $1, now())`, [userId]);
      }
      await admin.query(`INSERT INTO tenant_members (id, "userId", "tenantId", "updatedAt") VALUES ($1, $2, $3, now()), ($4, $5, $3, now()), ($6, $7, $8, now())`, [
        id('m'), authorA, A, id('m'), checkerA, id('m'), memberB, B,
      ]);
    } finally {
      admin.release();
    }
    await asTenant(A, async (client) => {
      a.companyType = await typeRow(client, A, 'COMPANY', { root: true, holds: false });
      a.regionType = await typeRow(client, A, 'REGION', { parents: ['COMPANY'], holds: false });
      a.storeType = await typeRow(client, A, 'STORE', { parents: ['REGION'] });
      a.company = await unitRow(client, A, a.companyType, 'FRESHMART');
      a.north = await unitRow(client, A, a.regionType, 'NORTH');
      a.store = await unitRow(client, A, a.storeType, 'STORE-101');
      a.tree = id('tree');
      await client.query(
        `INSERT INTO org_trees (id, "tenantId", code, name, kind, purpose, "createdById") VALUES ($1, $2, 'primary', 'Organization', 'PRIMARY', 'AUTHORITY', $3)`,
        [a.tree, A, authorA],
      );
    });
    await asTenant(B, async (client) => {
      const typeId = await typeRow(client, B, 'MINISTRY', { root: true });
      bUnit = await unitRow(client, B, typeId, 'HEALTH');
    });
  });
  afterAll(async () => {
    await pool?.end();
  });

  const draft = (versionNumber: number) =>
    asTenant(A, async (client) => {
      const versionId = id('ver');
      await client.query(
        `INSERT INTO org_hierarchy_versions (id, "tenantId", "treeId", "versionNumber", "createdById") VALUES ($1, $2, $3, $4, $5)`,
        [versionId, A, a.tree, versionNumber, authorA],
      );
      return versionId;
    });
  const setEdges = (versionId: string, edges: Array<[string, string | null]>) =>
    asTenant(A, async (client) => {
      for (const [unitId, parentUnitId] of edges) {
        await client.query(`INSERT INTO org_hierarchy_edges ("tenantId", "versionId", "unitId", "parentUnitId") VALUES ($1, $2, $3, $4)`, [A, versionId, unitId, parentUnitId]);
      }
    });
  const validate = (versionId: string) =>
    asTenant(A, async (client) => (await client.query<{ code: string; unitId: string }>('SELECT * FROM org_validate_hierarchy_version($1, $2)', [A, versionId])).rows);
  const move = (versionId: string, status: string, extra = '') =>
    asTenant(A, (client) => client.query(`UPDATE org_hierarchy_versions SET status = $3 ${extra} WHERE "tenantId" = $1 AND id = $2`, [A, versionId, status]));

  it('keeps every tenant to its own rows, and refuses writing into another tenant', async () => {
    const seenByA = await asTenant(A, async (client) => (await client.query<{ id: string }>('SELECT id FROM org_units')).rows.map((row) => row.id));
    expect(seenByA).toEqual(expect.arrayContaining([a.company, a.north, a.store]));
    expect(seenByA).not.toContain(bUnit);
    await expect(asTenant(B, (client) => client.query(`UPDATE org_units SET name = 'x' WHERE id = $1`, [a.store]).then((r) => r.rowCount))).resolves.toBe(0);
    await expect(
      asTenant(B, (client) => client.query(`INSERT INTO org_trees (id, "tenantId", code, name, kind, purpose, "createdById") VALUES ($1, $2, 'x', 'x', 'ALTERNATE', 'REPORTING', 'b')`, [id('tree'), A])),
    ).rejects.toThrow(/row-level security/);
  });

  it('allows one primary tree per tenant, and only the primary tree carries authority', async () => {
    await expect(
      asTenant(A, (client) => client.query(`INSERT INTO org_trees (id, "tenantId", code, name, kind, purpose, "createdById") VALUES ($1, $2, 'second', 'x', 'PRIMARY', 'AUTHORITY', $3)`, [id('tree'), A, authorA])),
    ).rejects.toThrow(/org_trees_one_primary_per_tenant/);
    await expect(
      asTenant(A, (client) => client.query(`INSERT INTO org_trees (id, "tenantId", code, name, kind, purpose, "createdById") VALUES ($1, $2, 'cost', 'x', 'ALTERNATE', 'AUTHORITY', $3)`, [id('tree'), A, authorA])),
    ).rejects.toThrow(/org_trees_authority_check/);
  });

  it('finds cycles, depth, parent and root rule breaches before anything is published', async () => {
    const v = await draft(1);
    await setEdges(v, [[a.company, null], [a.north, a.company], [a.store, a.north]]);
    expect(await validate(v)).toEqual([]);
    // Store directly under the company breaks the type rules; a region at the top is not allowed.
    await asTenant(A, (client) => client.query(`UPDATE org_hierarchy_edges SET "parentUnitId" = $3 WHERE "versionId" = $1 AND "unitId" = $2`, [v, a.store, a.company]));
    await asTenant(A, (client) => client.query(`UPDATE org_hierarchy_edges SET "parentUnitId" = NULL WHERE "versionId" = $1 AND "unitId" = $2`, [v, a.north]));
    expect((await validate(v)).map((problem) => problem.code).sort()).toEqual(['PARENT_NOT_ALLOWED', 'ROOT_NOT_ALLOWED']);
    // A cycle: company → north → company.
    await asTenant(A, (client) => client.query(`UPDATE org_hierarchy_edges SET "parentUnitId" = $3 WHERE "versionId" = $1 AND "unitId" = $2`, [v, a.company, a.north]));
    await asTenant(A, (client) => client.query(`UPDATE org_hierarchy_edges SET "parentUnitId" = $3 WHERE "versionId" = $1 AND "unitId" = $2`, [v, a.north, a.company]));
    expect((await validate(v)).map((problem) => problem.code)).toContain('CYCLE');
    // A parent from another tenant or outside this version cannot even be stored.
    await expect(setEdges(v, [[bUnit, a.company]])).rejects.toThrow(/foreign key/);
    // Withdraw the draft so the next test can open one.
    await move(v, 'REJECTED', `, "rejectedById" = '${authorA}'`);
  });

  it('refuses a too-deep tree', async () => {
    const deepType = await asTenant(A, (client) => typeRow(client, A, `DEEP_${run}`.toUpperCase().replace(/-/g, '_'), { root: true, parents: [`DEEP_${run}`.toUpperCase().replace(/-/g, '_')] }));
    const units: string[] = [];
    for (let index = 0; index < 18; index += 1) units.push(await asTenant(A, (client) => unitRow(client, A, deepType, `deep-${run}-${index}`)));
    const v = await draft(2);
    await setEdges(v, units.map((unitId, index) => [unitId, index === 0 ? null : units[index - 1]!] as [string, string | null]));
    expect((await validate(v)).map((problem) => problem.code)).toContain('TOO_DEEP');
    await move(v, 'REJECTED', `, "rejectedById" = '${authorA}'`);
  });

  it('enforces maker-checker, the forward-only lifecycle and immutability after publishing', async () => {
    const v = await draft(3);
    await setEdges(v, [[a.company, null], [a.north, a.company], [a.store, a.north]]);
    await expect(move(v, 'PUBLISHED')).rejects.toThrow(/cannot move from DRAFT to PUBLISHED/);
    await move(v, 'VALIDATED');
    await move(v, 'SUBMITTED', `, "submittedById" = '${authorA}', "submittedAt" = now()`);
    await expect(move(v, 'APPROVED', `, "approvedById" = '${authorA}', "approvedAt" = now()`)).rejects.toThrow(/org_hierarchy_versions_checker_check/);
    await move(v, 'APPROVED', `, "approvedById" = '${checkerA}', "approvedAt" = now()`);
    // Edges are frozen once submitted; the closure is written while publishing.
    await expect(setEdges(v, [[a.store, a.company]])).rejects.toThrow(/cannot change/);
    await expect(
      asTenant(A, (client) => client.query(`INSERT INTO org_hierarchy_closure ("tenantId", "versionId", "ancestorUnitId", "descendantUnitId", depth) VALUES ($1, $2, $3, $3, 0)`, [A, v, bUnit])),
    ).rejects.toThrow(/org_hierarchy_closure_ancestor_fkey/);
    await asTenant(A, async (client) => {
      for (const [ancestor, descendant, depth] of [
        [a.company, a.company, 0], [a.north, a.north, 0], [a.store, a.store, 0],
        [a.company, a.north, 1], [a.north, a.store, 1], [a.company, a.store, 2],
      ] as const) {
        await client.query(
          `INSERT INTO org_hierarchy_closure ("tenantId", "versionId", "ancestorUnitId", "descendantUnitId", depth) VALUES ($1, $2, $3, $4, $5)`,
          [A, v, ancestor, descendant, depth],
        );
      }
      await client.query(
        `UPDATE org_hierarchy_versions SET status = 'PUBLISHED', "publishedById" = $3, "publishedAt" = now(), checksum = $4 WHERE "tenantId" = $1 AND id = $2`,
        [A, v, authorA, `sha256:${'a'.repeat(64)}`],
      );
    });
    await expect(move(v, 'PUBLISHED', `, reason = 'tamper'`)).rejects.toThrow(/immutable/);
    await expect(
      asTenant(A, (client) => client.query(`INSERT INTO org_hierarchy_closure ("tenantId", "versionId", "ancestorUnitId", "descendantUnitId", depth) VALUES ($1, $2, $3, $3, 0)`, [A, v, a.store])),
    ).rejects.toThrow(/written once/);
    // Activation: only a published version, append-only history.
    await asTenant(A, (client) =>
      client.query(`INSERT INTO org_hierarchy_activations (id, "tenantId", "treeId", "versionId", "effectiveFrom", reason, "activatedById") VALUES ($1, $2, $3, $4, now(), 'go live', $5)`, [
        id('act'), A, a.tree, v, authorA,
      ]),
    );
    const open = await draft(4);
    await expect(
      asTenant(A, (client) =>
        client.query(`INSERT INTO org_hierarchy_activations (id, "tenantId", "treeId", "versionId", "effectiveFrom", reason, "activatedById") VALUES ($1, $2, $3, $4, now() + interval '1 day', 'early', $5)`, [
          id('act'), A, a.tree, open, authorA,
        ]),
      ),
    ).rejects.toThrow(/only a published version/);
    // The tenant role has no UPDATE/DELETE on history, and the trigger refuses even the connection superuser.
    await expect(asTenant(A, (client) => client.query(`UPDATE org_hierarchy_activations SET reason = 'x' WHERE "tenantId" = $1`, [A]))).rejects.toThrow(/permission denied/);
    await expect(pool.query(`DELETE FROM org_hierarchy_activations WHERE "tenantId" = $1`, [A])).rejects.toThrow(/append-only/);
    await expect(pool.query(`UPDATE org_hierarchy_versions SET reason = 'x' WHERE id = $1`, [v])).rejects.toThrow(/immutable/);
    // One open draft per tree at a time.
    await expect(draft(5)).rejects.toThrow(/org_hierarchy_versions_one_open_draft/);
    // The active tree answers "everything below the North region" from the closure.
    const below = await asTenant(A, async (client) =>
      (await client.query<{ id: string }>(
        `SELECT c."descendantUnitId" AS id FROM org_hierarchy_closure c
          WHERE c."versionId" = (SELECT "versionId" FROM org_hierarchy_activations WHERE "treeId" = $1 AND "effectiveFrom" <= now() ORDER BY "effectiveFrom" DESC LIMIT 1)
            AND c."ancestorUnitId" = $2 ORDER BY c.depth`,
        [a.tree, a.north],
      )).rows.map((row) => row.id),
    );
    expect(below).toEqual([a.north, a.store]);
  });

  it('grants a unit only to a member of the same tenant', async () => {
    await asTenant(A, (client) =>
      client.query(`INSERT INTO org_scope_grants (id, "tenantId", "userId", "unitId", access, "effectiveFrom", reason, "grantedById") VALUES ($1, $2, $3, $4, 'READ_WRITE', now(), 'regional manager', $5)`, [
        id('grant'), A, checkerA, a.north, authorA,
      ]),
    );
    await expect(
      asTenant(A, (client) =>
        client.query(`INSERT INTO org_scope_grants (id, "tenantId", "userId", "unitId", access, "effectiveFrom", reason, "grantedById") VALUES ($1, $2, $3, $4, 'READ', now(), 'cross-tenant', $5)`, [
          id('grant'), A, memberB, a.north, authorA,
        ]),
      ),
    ).rejects.toThrow(/org_scope_grants_member_fkey/);
  });
});
