/**
 * WI-OI-120ho (R5): proves the people place-scope-by-assignment predicate isolates North from South against a real
 * gigalibs_workforce schema. Runs only against the throwaway `r5_proof` database; skipped without R5_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { peoplePlacesScopeByAssignment } from './scope.js';

const databaseUrl = process.env.R5_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r5_proof') throw new Error('Refusing: only the r5_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R5 people place-scope-by-assignment (isolated PostgreSQL)', () => {
  const tenantId = `t-r5-${Date.now().toString(36)}`;
  const siteNorth = randomUUID();
  const siteSouth = randomUUID();
  const northPerson = randomUUID();
  const southPerson = randomUUID();
  const unassigned = randomUUID();
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const meta = ['sys', 'sys', 'corr'];
    const jp = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.job_profiles (id, tenant_id, code, created_by, updated_by, correlation_id) VALUES ($1,$2,'JP1',$3,$4,$5)`,
      [jp, tenantId, ...meta],
    );
    const posNorth = randomUUID();
    const posSouth = randomUUID();
    for (const [id, code, site] of [
      [posNorth, 'POSN', siteNorth],
      [posSouth, 'POSS', siteSouth],
    ] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.positions (id, tenant_id, code, job_profile_id, site_ref, fte, effective_from, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,1,'2026-01-01',$6,$7,$8)`,
        [id, tenantId, code, jp, site, ...meta],
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
    const absenceType = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.absence_types (id, tenant_id, code, name, created_by, updated_by, correlation_id) VALUES ($1,$2,'VAC','Vacation',$3,$4,$5)`,
      [absenceType, tenantId, ...meta],
    );
    for (const resource of [northPerson, southPerson] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.absences (id, tenant_id, resource_id, absence_type_id, starts_at, ends_at, requested_by, correlation_id)
         VALUES ($1,$2,$3,$4,'2026-02-01T09:00:00Z','2026-02-02T17:00:00Z','sys','corr')`,
        [randomUUID(), tenantId, resource, absenceType],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  async function peopleScopedToPlaces(places: readonly string[]): Promise<string[]> {
    const result = await client.query<{ id: string }>(
      `SELECT r.id FROM gigalibs_workforce.workforce_resources r
        WHERE r.tenant_id = $1 AND ${peoplePlacesScopeByAssignment('$2::uuid[]')} ORDER BY r.reference_code`,
      [tenantId, [...places]],
    );
    return result.rows.map((row) => row.id);
  }

  it('a North-scoped caller sees only the North person', async () => {
    expect(await peopleScopedToPlaces([siteNorth])).toEqual([northPerson]);
  });

  it('a South-scoped caller sees only the South person', async () => {
    expect(await peopleScopedToPlaces([siteSouth])).toEqual([southPerson]);
  });

  it('never leaks a person assigned only at the other place, and hides the unassigned person from a scoped caller', async () => {
    const north = await peopleScopedToPlaces([siteNorth]);
    expect(north).not.toContain(southPerson);
    expect(north).not.toContain(unassigned);
  });

  it('an unbounded caller (no place filter) sees everyone, including the unassigned person', async () => {
    const all = await client.query<{ id: string }>(`SELECT id FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1`, [tenantId]);
    expect(all.rows.map((row) => row.id).sort()).toEqual([northPerson, southPerson, unassigned].sort());
  });

  it('a place-scoped approver sees only the absences of people assigned at their places', async () => {
    const north = await client.query<{ resource_id: string }>(
      `SELECT a.resource_id FROM gigalibs_workforce.absences a
        WHERE a.tenant_id = $1 AND ${peoplePlacesScopeByAssignment('$2::uuid[]', 'a.resource_id', 'a.tenant_id')}`,
      [tenantId, [siteNorth]],
    );
    expect(north.rows.map((row) => row.resource_id)).toEqual([northPerson]);
  });
});
