/**
 * WI-OI-120ho (R5): proves the person scope-by-assignment clause isolates North from South by place AND by unit,
 * against a real gigalibs_workforce schema. Runs only against the throwaway `r5_proof` database; skipped without
 * R5_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { peopleScopeClause } from './scope.js';

const databaseUrl = process.env.R5_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r5_proof') throw new Error('Refusing: only the r5_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R5 person scope-by-assignment (isolated PostgreSQL)', () => {
  const tenantId = `t-r5-${Date.now().toString(36)}`;
  const siteNorth = randomUUID();
  const siteSouth = randomUUID();
  const northPerson = randomUUID();
  const southPerson = randomUUID();
  const unassigned = randomUUID();
  const version = 'v1';
  let client: pg.Client;

  const principal = (over: Partial<GigaOpsPrincipal>): GigaOpsPrincipal =>
    ({ tenantId, spatialScope: { mode: 'UNBOUNDED' }, ...over }) as GigaOpsPrincipal;
  const placeScoped = (places: string[]) => principal({ spatialScope: { mode: 'SCOPED_PLACES', place_ids: places } as never });
  const unitScoped = (roots: string[]) =>
    principal({ organization: { mode: 'SCOPED', tree_version: version, read_roots: roots, write_roots: roots } as never });

  async function peopleFor(p: GigaOpsPrincipal): Promise<string[]> {
    const values: unknown[] = [tenantId];
    const clause = await peopleScopeClause(client as never, p, (value) => {
      values.push(value);
      return `$${values.length}`;
    });
    const sql = `SELECT r.id FROM gigalibs_workforce.workforce_resources r WHERE r.tenant_id = $1${clause ? ` AND ${clause}` : ''} ORDER BY r.reference_code`;
    return (await client.query<{ id: string }>(sql, values)).rows.map((row) => row.id);
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const meta = ['sys', 'sys', 'corr'];
    // Organization replica: a READY version with two units, each its own closure row.
    await client.query(
      `INSERT INTO gigalibs_workforce.org_replica_versions (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
       VALUES ($1,$2,'tree-1','PRIMARY',1,$3,'READY',2,now())`,
      [tenantId, version, `sha256:${'0'.repeat(64)}`],
    );
    for (const [unit, name] of [['unit-north', 'North'], ['unit-south', 'South']] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.org_replica_units (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1,$2,$3,NULL,$4,$5,0,'ACTIVE',true,'DEPT')`,
        [tenantId, version, unit, unit.toUpperCase(), name],
      );
      await client.query(
        `INSERT INTO gigalibs_workforce.org_replica_closure (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth) VALUES ($1,$2,$3,$3,0)`,
        [tenantId, version, unit],
      );
    }
    const jp = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.job_profiles (id, tenant_id, code, created_by, updated_by, correlation_id) VALUES ($1,$2,'JP1',$3,$4,$5)`,
      [jp, tenantId, ...meta],
    );
    const posNorth = randomUUID();
    const posSouth = randomUUID();
    for (const [id, code, site, unit] of [
      [posNorth, 'POSN', siteNorth, 'unit-north'],
      [posSouth, 'POSS', siteSouth, 'unit-south'],
    ] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.positions (id, tenant_id, code, job_profile_id, site_ref, department_id, fte, effective_from, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,1,'2026-01-01',$7,$8,$9)`,
        [id, tenantId, code, jp, site, unit, ...meta],
      );
    }
    for (const [id, ref, name] of [
      [northPerson, 'RN1', 'North Person'],
      [southPerson, 'RS1', 'South Person'],
      [unassigned, 'RU1', 'Unassigned Person'],
    ] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.workforce_resources (id, tenant_id, reference_code, display_name, resource_type, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,'HUMAN',$5,$6,$7)`,
        [id, tenantId, ref, name, ...meta],
      );
    }
    for (const [resource, position] of [
      [northPerson, posNorth],
      [southPerson, posSouth],
    ] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.engagements (id, tenant_id, resource_id, position_id, engagement_type, fte, start_date, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,'EMPLOYEE',1,'2026-01-01',$5,$6,$7)`,
        [randomUUID(), tenantId, resource, position, ...meta],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it('place scope: North sees only North, South only South', async () => {
    expect(await peopleFor(placeScoped([siteNorth]))).toEqual([northPerson]);
    expect(await peopleFor(placeScoped([siteSouth]))).toEqual([southPerson]);
  });

  it('unit scope: the North unit sees only the North person, the South unit only the South person', async () => {
    expect(await peopleFor(unitScoped(['unit-north']))).toEqual([northPerson]);
    expect(await peopleFor(unitScoped(['unit-south']))).toEqual([southPerson]);
  });

  it('a scoped caller never sees the other side or the unassigned person', async () => {
    const north = await peopleFor(placeScoped([siteNorth]));
    expect(north).not.toContain(southPerson);
    expect(north).not.toContain(unassigned);
  });

  it('an unbounded caller sees everyone, including the unassigned person', async () => {
    expect((await peopleFor(principal({}))).sort()).toEqual([northPerson, southPerson, unassigned].sort());
  });
});
