/**
 * WI-OI-167 (R5 Workforce): proves that demand, candidates and bookings keep North and South apart by unit and by place,
 * against a real gigalibs_workforce schema (migrations 1–30). Runs only against the throwaway `r5_proof` database;
 * skipped without R5_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { peopleUnitClause } from '../common/scope.js';
import { BookingsService } from './bookings.service.js';

const databaseUrl = process.env.R5_TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== '/r5_proof') throw new Error('Refusing: only the r5_proof database is allowed.');
const integration = describe.skipIf(!databaseUrl);

integration('R5 Workforce demand, candidates and bookings (isolated PostgreSQL)', () => {
  const tenantId = `t-167-${Date.now().toString(36)}`;
  const version = 'v1';
  const siteNorth = randomUUID();
  const siteSouth = randomUUID();
  const northPerson = randomUUID();
  const southPerson = randomUUID();
  const northRequirement = randomUUID();
  const southRequirement = randomUUID();
  const sharedRequirement = randomUUID();
  const permissions = [
    'workforce.bookings.read', 'workforce.bookings.manage', 'workforce.bookings.override', 'workforce.demand.read', 'workforce.demand.manage',
  ];
  let client: pg.Client;
  let bookings: BookingsService;

  const principal = (over: Partial<GigaOpsPrincipal>): GigaOpsPrincipal =>
    ({ tenantId, subject: 'supervisor', permissions, roles: [], spatialScope: { mode: 'UNBOUNDED' }, ...over }) as GigaOpsPrincipal;
  const unit = (root: string) =>
    principal({ organization: { mode: 'UNITS', tree_version: version, read_roots: [root], write_roots: [root] } as never });
  const place = (site: string) => principal({ spatialScope: { mode: 'SCOPED_PLACES', place_ids: [site] } as never });
  const workspace = principal({ organization: { mode: 'TENANT', tree_version: version } as never });
  const context = (who: GigaOpsPrincipal) => ({ principal: who, correlationId: randomUUID() });
  const candidates = async (who: GigaOpsPrincipal, requirement: string) =>
    (await bookings.candidates(who, requirement)).items.map((item) => item.resourceId).sort();
  const book = (who: GigaOpsPrincipal, requirementId: string, resourceId: string) =>
    bookings.createBooking(context(who), { requestKey: randomUUID(), requirementId, resourceId, overrideReason: 'proof: no working pattern seeded' });

  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    // Each call in its own transaction, as WorkforceDatabaseService does (savepoints need one).
    const database = {
      withTenantTransaction: async (_tenant: string, work: (c: pg.Client) => unknown) => {
        await client.query('BEGIN');
        try {
          const result = await work(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      },
    } as never;
    bookings = new BookingsService(database, new AvailabilityService(database));
    const meta = ['sys', 'sys', 'corr'];
    await client.query(
      `INSERT INTO gigalibs_workforce.org_replica_versions (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
       VALUES ($1,$2,'tree-1','PRIMARY',1,$3,'READY',2,now())`,
      [tenantId, version, `sha256:${'0'.repeat(64)}`],
    );
    for (const [unitId, name] of [['unit-north', 'North'], ['unit-south', 'South']] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.org_replica_units (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1,$2,$3,NULL,$4,$5,0,'ACTIVE',true,'DEPT')`,
        [tenantId, version, unitId, unitId.toUpperCase(), name],
      );
      await client.query(
        `INSERT INTO gigalibs_workforce.org_replica_closure (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth) VALUES ($1,$2,$3,$3,0)`,
        [tenantId, version, unitId],
      );
    }
    const profile = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.job_profiles (id, tenant_id, code, created_by, updated_by, correlation_id) VALUES ($1,$2,'JP1',$3,$4,$5)`,
      [profile, tenantId, ...meta],
    );
    for (const [person, code, site, unitId, reference, name] of [
      [northPerson, 'POSN', siteNorth, 'unit-north', 'RN1', 'North Person'],
      [southPerson, 'POSS', siteSouth, 'unit-south', 'RS1', 'South Person'],
    ] as const) {
      const position = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_workforce.positions (id, tenant_id, code, job_profile_id, site_ref, department_id, fte, effective_from, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,1,'2026-01-01',$7,$8,$9)`,
        [position, tenantId, code, profile, site, unitId, ...meta],
      );
      await client.query(
        `INSERT INTO gigalibs_workforce.workforce_resources (id, tenant_id, reference_code, display_name, resource_type, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,'HUMAN',$5,$6,$7)`,
        [person, tenantId, reference, name, ...meta],
      );
      await client.query(
        `INSERT INTO gigalibs_workforce.engagements (id, tenant_id, resource_id, position_id, engagement_type, fte, start_date, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,'EMPLOYEE',1,'2026-01-01',$5,$6,$7)`,
        [randomUUID(), tenantId, person, position, ...meta],
      );
    }
    const day = (offset: number) => new Date(Date.UTC(2027, 0, 4 + offset, 8)).toISOString();
    for (const [id, title, site, unitId, offset] of [
      [northRequirement, 'North shift', siteNorth, 'unit-north', 0],
      [southRequirement, 'South shift', siteSouth, 'unit-south', 1],
      [sharedRequirement, 'Shared shift', siteNorth, null, 2],
    ] as const) {
      await client.query(
        `INSERT INTO gigalibs_workforce.work_requirements
           (id, tenant_id, request_key, title, source_type, site_ref, organization_unit_id, starts_at, ends_at, headcount, required_capabilities,
            created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,'MANUAL',$5,$6,$7,$8,2,'[]'::jsonb,$9,$10,$11)`,
        [id, tenantId, randomUUID(), title, site, unitId, day(offset), new Date(Date.parse(day(offset)) + 8 * 3_600_000).toISOString(), ...meta],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it('lists only the demand of the caller’s units (and shared demand), and of their places', async () => {
    const titles = async (who: GigaOpsPrincipal) => (await bookings.listRequirements(who, {})).items.map((item) => item.title).sort();
    expect(await titles(unit('unit-north'))).toEqual(['North shift', 'Shared shift']);
    expect(await titles(unit('unit-south'))).toEqual(['Shared shift', 'South shift']);
    expect(await titles(place(siteSouth))).toEqual(['South shift']);
    expect(await titles(workspace)).toEqual(['North shift', 'Shared shift', 'South shift']);
  });

  it('offers only the caller’s people as candidates, by unit and by place', async () => {
    expect(await candidates(unit('unit-north'), sharedRequirement)).toEqual([northPerson]);
    expect(await candidates(unit('unit-south'), sharedRequirement)).toEqual([southPerson]);
    expect(await candidates(place(siteNorth), sharedRequirement)).toEqual([northPerson]);
    expect(await candidates(workspace, sharedRequirement)).toEqual([northPerson, southPerson].sort());
    await expect(bookings.candidates(unit('unit-south'), northRequirement)).rejects.toMatchObject({ status: 404 });
  });

  it('finds candidates by name and pages them', async () => {
    const page = await bookings.candidates(workspace, sharedRequirement, { search: 'south', limit: 1 });
    expect(page.items.map((item) => item.resourceId)).toEqual([southPerson]);
    expect((await bookings.candidates(workspace, sharedRequirement, { limit: 1 })).nextOffset).toBe(1);
  });

  it('refuses booking someone else’s person, or onto shared demand, for a unit-limited supervisor', async () => {
    await expect(book(unit('unit-north'), northRequirement, southPerson)).rejects.toMatchObject({ response: { code: 'WORKFORCE_OUT_OF_SCOPE' } });
    await expect(book(unit('unit-north'), sharedRequirement, northPerson)).rejects.toMatchObject({ response: { code: 'WORKFORCE_OUT_OF_SCOPE' } });
    const booked = await book(unit('unit-north'), northRequirement, northPerson);
    expect(booked).toMatchObject({ resourceId: northPerson, status: 'DRAFT' });
    expect(await book(workspace, sharedRequirement, southPerson)).toMatchObject({ resourceId: southPerson });
  });

  it('gives new demand the unit of a supervisor limited to one unit, and refuses another unit', async () => {
    const created = await bookings.createRequirement(context(unit('unit-south')), {
      requestKey: randomUUID(), title: 'South extra', siteRef: siteSouth, startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T16:00:00Z',
    });
    expect(created.organizationUnitId).toBe('unit-south');
    await expect(
      bookings.createRequirement(context(unit('unit-south')), {
        requestKey: randomUUID(), title: 'Not mine', organizationUnitId: 'unit-north', startsAt: '2027-02-02T08:00:00Z', endsAt: '2027-02-02T16:00:00Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'WORKFORCE_OUT_OF_SCOPE' } });
  });

  it('time follows the unit: the North unit reaches the North person, not the South person', async () => {
    const reach = async (who: GigaOpsPrincipal, person: string) => {
      const values: unknown[] = [tenantId, person];
      const clause = await peopleUnitClause(client as never, who, (value) => {
        values.push(value);
        return `$${values.length}`;
      }, 'r.id', 'r.tenant_id');
      const sql = `SELECT 1 FROM gigalibs_workforce.workforce_resources r WHERE r.tenant_id = $1 AND r.id = $2${clause ? ` AND ${clause}` : ''}`;
      return (await client.query(sql, values)).rows.length > 0;
    };
    expect(await reach(unit('unit-north'), northPerson)).toBe(true);
    expect(await reach(unit('unit-north'), southPerson)).toBe(false);
    expect(await reach(workspace, southPerson)).toBe(true);
  });

  it('absence decisions follow the unit: North cannot decide a South person’s absence; South can', async () => {
    const availability = new AvailabilityService({
      withTenantTransaction: async (_tenant: string, work: (c: pg.Client) => unknown) => {
        await client.query('BEGIN');
        try {
          const result = await work(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      },
    } as never);
    const type = randomUUID();
    const absence = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.absence_types (id, tenant_id, code, name, created_by, updated_by, correlation_id) VALUES ($1,$2,'LEAVE','Leave','sys','sys','corr')`,
      [type, tenantId],
    );
    await client.query(
      `INSERT INTO gigalibs_workforce.absences (id, tenant_id, resource_id, absence_type_id, starts_at, ends_at, requested_by, correlation_id)
       VALUES ($1,$2,$3,$4,'2027-03-01T00:00:00Z','2027-03-02T00:00:00Z','someone','corr')`,
      [absence, tenantId, southPerson, type],
    );
    const approver = (who: GigaOpsPrincipal) => ({ ...who, permissions: [...who.permissions, 'workforce.absences.approve'] }) as GigaOpsPrincipal;
    await expect(availability.decideAbsence(context(approver(unit('unit-north'))), absence, 'APPROVED', { expectedVersion: 1 })).rejects.toMatchObject({
      response: { code: 'WORKFORCE_OUT_OF_SCOPE' },
    });
    expect(await availability.decideAbsence(context(approver(unit('unit-south'))), absence, 'APPROVED', { expectedVersion: 1 })).toMatchObject({ status: 'APPROVED' });
  });
});
