import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CreateSpeedProjectInputV1 } from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  ModuleIdempotencyStore,
  type ModulePrincipal,
  type OrganizationClaim,
  type RecordDispatcher,
} from '@gigalibs/module-sdk';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database.service.js';
import { speedRecordDispatcher } from './projects-record-adapters.js';
import { ProjectsService } from './projects.service.js';

// WI-OI-120bw (SPEED S3): projects on PostgreSQL 16, as the least-privileged runtime role the module migration runner
// creates, under forced row-level security. Opt-in, and only against a local database named speed_proof (never the UAT
// instance on port 5440): start a throwaway PostgreSQL and set SPEED_TEST_DATABASE_URL to its admin URL.
const adminUrl = process.env.SPEED_TEST_DATABASE_URL;
if (adminUrl) {
  const parsed = new URL(adminUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.port === '5440' ||
    parsed.pathname !== '/speed_proof'
  ) {
    throw new Error(
      'Refusing the SPEED proof: only a local speed_proof database (not port 5440) is allowed.',
    );
  }
}

const MIGRATION = join(
  import.meta.dirname,
  '../../../../db/migrations/000001_speed_foundation.up.sql',
);
const ROLE = 'speed_runtime_proof';
const TENANT_A = `tenant-a-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-b-${randomUUID().slice(0, 8)}`;
const TREE = 'tree-version-1';
const READ = ['speed:read', 'speed.routes.read'];
const WRITE = [...READ, 'speed.routes.write'];

function principal(
  tenantId: string,
  subject: string,
  permissions: readonly string[],
  organization?: OrganizationClaim,
): ModulePrincipal {
  return {
    tenantId,
    subject,
    sessionId: `session-${subject}`,
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'TENANT_ADMIN' as ModulePrincipal['persona'],
    ...(organization ? { organization } : {}),
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'ALL' },
  } as ModulePrincipal;
}

const command = (who: ModulePrincipal): ModuleCommandContext => ({
  principal: who,
  correlationId: randomUUID(),
});
const input = (overrides: Partial<CreateSpeedProjectInputV1> = {}): CreateSpeedProjectInputV1 => ({
  requestKey: randomUUID(),
  code: `P-${randomUUID().slice(0, 8)}`,
  name: 'Route scouting',
  siteUnitId: 'north',
  ...overrides,
});

async function rejection(work: Promise<unknown>): Promise<{ type: unknown; code: unknown }> {
  try {
    await work;
  } catch (error) {
    const body = error instanceof HttpException ? error.getResponse() : null;
    return {
      type: (error as object).constructor,
      code: body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined,
    };
  }
  throw new Error('Expected a rejection.');
}

describe.skipIf(!adminUrl)('SPEED projects on PostgreSQL (WI-OI-120bw)', () => {
  let admin: pg.Client;
  let database: DatabaseService;
  let projects: ProjectsService;
  let records: RecordDispatcher;
  let runtimeUrl: string;
  // A tenant-wide administrator in each tenant, and two site members in tenant A.
  const adminA = principal(TENANT_A, 'admin-a', WRITE);
  const adminB = principal(TENANT_B, 'admin-b', WRITE);
  const units = (roots: string[]): OrganizationClaim => ({
    mode: 'UNITS',
    tree_version: TREE,
    read_roots: roots,
    write_roots: roots,
  });
  const northChemist = principal(TENANT_A, 'chemist-north', WRITE, units(['north']));
  const northReader = principal(TENANT_A, 'reader-north', READ, units(['north']));

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query('DROP SCHEMA IF EXISTS gigalibs_speed CASCADE');
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.query(readFileSync(MIGRATION, 'utf8'));
    // The runtime role as run-module-migrations.mjs creates it: no superuser, no BYPASSRLS, audit append-only.
    const password = randomUUID().replaceAll('-', '');
    await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA gigalibs_speed TO ${ROLE}`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_speed TO ${ROLE}`,
    );
    await admin.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gigalibs_speed TO ${ROLE}`);
    await admin.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gigalibs_speed.schema_migrations FROM ${ROLE}`,
    );
    await admin.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gigalibs_speed.auth_revocation_events FROM ${ROLE}`,
    );
    await admin.query(
      `REVOKE UPDATE, DELETE, TRUNCATE ON gigalibs_speed.audit_events FROM ${ROLE}`,
    );
    // Tenant A's organization in force: a site group holding North and South, and a plant group that holds no records.
    await admin.query(
      `INSERT INTO gigalibs_speed.org_replica_versions (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
       VALUES ($1, $2, 'tree-1', 'PRIMARY', 1, $3, 'READY', 3, now())`,
      [TENANT_A, TREE, `sha256:${'0'.repeat(64)}`],
    );
    for (const [unit, parent, holds, order] of [
      ['sites', null, false, 0],
      ['north', 'sites', true, 1],
      ['south', 'sites', true, 2],
    ] as const) {
      await admin.query(
        `INSERT INTO gigalibs_speed.org_replica_units (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1, $2, $3, $4, $3, $3, $5, 'ACTIVE', $6, $7)`,
        [TENANT_A, TREE, unit, parent, order, holds, holds ? 'SITE' : 'REGION'],
      );
    }
    for (const [ancestor, descendant, depth] of [
      ['sites', 'sites', 0],
      ['north', 'north', 0],
      ['south', 'south', 0],
      ['sites', 'north', 1],
      ['sites', 'south', 1],
    ] as const) {
      await admin.query(
        `INSERT INTO gigalibs_speed.org_replica_closure (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth) VALUES ($1, $2, $3, $4, $5)`,
        [TENANT_A, TREE, ancestor, descendant, depth],
      );
    }
    const runtime = new URL(adminUrl as string);
    runtime.username = ROLE;
    runtime.password = password;
    runtimeUrl = runtime.toString();
    database = new DatabaseService({
      databaseUrl: runtimeUrl,
      databasePoolSize: 4,
      expectedMigrationVersion: 1,
    } as never);
    // Readiness as the module host runs it: the schema exactly at migration 1, the role neither superuser nor BYPASSRLS.
    await database.onModuleInit();
    projects = new ProjectsService(database);
    records = speedRecordDispatcher(
      { projects },
      new ModuleIdempotencyStore(database, { retentionDays: 7 }),
    );
  });

  afterAll(async () => {
    await database?.onModuleDestroy();
    await admin?.query('DROP SCHEMA IF EXISTS gigalibs_speed CASCADE');
    await admin?.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin?.end();
  });

  const audit = async (projectId: string) =>
    (
      await admin.query<{
        action: string;
        actor_subject: string;
        payload: { changes: Record<string, { from: unknown; to: unknown }>; reason: string | null };
      }>(
        `SELECT action, actor_subject, payload FROM gigalibs_speed.audit_events WHERE entity_id = $1 ORDER BY occurred_at, id`,
        [projectId],
      )
    ).rows;

  it('creates a project owned by its creator, with audit evidence and an outbox fact in the same transaction', async () => {
    const { project, replayed } = await projects.create(
      command(adminA),
      input({ code: 'P-100', notes: 'Kilo-lab candidate' }),
    );
    expect(replayed).toBe(false);
    expect(project).toMatchObject({
      code: 'P-100',
      siteUnitId: 'north',
      ownerSubject: 'admin-a',
      createdBy: 'admin-a',
      status: 'ACTIVE',
      version: 1,
    });
    expect(await audit(project.id)).toEqual([
      expect.objectContaining({
        action: 'PROJECT_CREATED',
        actor_subject: 'admin-a',
        payload: expect.objectContaining({
          reason: null,
          changes: expect.objectContaining({ code: { from: null, to: 'P-100' } }),
        }),
      }),
    ]);
    const outbox = await admin.query(
      `SELECT event_type, topic FROM gigalibs_speed.outbox_events WHERE aggregate_id = $1`,
      [project.id],
    );
    expect(outbox.rows).toEqual([{ event_type: 'PROJECT_CREATED_V1', topic: 'speed.facts.v1' }]);
  });

  it('replays a repeated request key without a second project or audit row', async () => {
    const request = input();
    const first = await projects.create(command(adminA), request);
    const again = await projects.create(command(adminA), request);
    expect(again).toEqual({ project: first.project, replayed: true });
    expect(await audit(first.project.id)).toHaveLength(1);
  });

  it('keeps project codes unique per workspace, ignoring case, but not across workspaces', async () => {
    await projects.create(command(adminA), input({ code: 'SHARED-1' }));
    expect(await rejection(projects.create(command(adminA), input({ code: 'shared-1' })))).toEqual({
      type: ConflictException,
      code: 'SPEED_UNIQUE_CONFLICT',
    });
    await expect(
      projects.create(command(adminB), input({ code: 'SHARED-1', siteUnitId: 'b-site' })),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('isolates tenants: another workspace cannot list, read, change or archive a project', async () => {
    const { project } = await projects.create(command(adminA), input());
    const listed = await projects.list(adminB, { page: 1, pageSize: 100 });
    expect(listed.items.some((item) => item.id === project.id)).toBe(false);
    expect((await rejection(projects.get(adminB, project.id))).type).toBe(NotFoundException);
    expect(
      (
        await rejection(
          projects.update(command(adminB), project.id, { version: 1, reason: 'x', name: 'Taken' }),
        )
      ).type,
    ).toBe(NotFoundException);
    expect(
      (await rejection(projects.archive(command(adminB), project.id, { version: 1, reason: 'x' })))
        .type,
    ).toBe(NotFoundException);
  });

  it('scopes projects by site: a North member sees and changes only North projects', async () => {
    const north = (await projects.create(command(adminA), input({ siteUnitId: 'north' }))).project;
    const south = (await projects.create(command(adminA), input({ siteUnitId: 'south' }))).project;
    const seen = (await projects.list(northChemist, { page: 1, pageSize: 100 })).items.map(
      (item) => item.siteUnitId,
    );
    expect(new Set(seen)).toEqual(new Set(['north']));
    await expect(projects.get(northChemist, north.id)).resolves.toMatchObject({ id: north.id });
    expect((await rejection(projects.get(northChemist, south.id))).type).toBe(NotFoundException);
    expect(
      (
        await rejection(
          projects.update(command(northChemist), south.id, {
            version: 1,
            reason: 'x',
            name: 'Moved',
          }),
        )
      ).type,
    ).toBe(NotFoundException);
    expect(
      await rejection(projects.create(command(northChemist), input({ siteUnitId: 'south' }))),
    ).toEqual({ type: ForbiddenException, code: 'ORGANIZATION_OUT_OF_SCOPE' });
  });

  it('refuses a site that holds no records or is not in the organization in force', async () => {
    const versioned = principal(TENANT_A, 'admin-a', WRITE, { mode: 'TENANT', tree_version: TREE });
    expect(
      await rejection(projects.create(command(versioned), input({ siteUnitId: 'sites' }))),
    ).toEqual({ type: ForbiddenException, code: 'ORGANIZATION_NOT_A_RECORD_UNIT' });
    expect(
      await rejection(projects.create(command(versioned), input({ siteUnitId: 'west' }))),
    ).toEqual({ type: ForbiddenException, code: 'ORGANIZATION_NOT_A_RECORD_UNIT' });
  });

  it('changes a project only at its current version, recording each changed field and the reason', async () => {
    const { project } = await projects.create(command(adminA), input({ name: 'Route A' }));
    expect(
      await rejection(
        projects.update(command(adminA), project.id, {
          version: 7,
          reason: 'Rename',
          name: 'Route B',
        }),
      ),
    ).toEqual({
      type: ConflictException,
      code: 'SPEED_VERSION_CONFLICT',
    });
    const changed = await projects.update(command(adminA), project.id, {
      version: 1,
      reason: 'Programme renamed',
      name: 'Route B',
      notes: null,
    });
    expect(changed).toMatchObject({ name: 'Route B', version: 2, notes: null });
    const [, update] = await audit(project.id);
    expect(update).toMatchObject({
      action: 'PROJECT_UPDATED',
      payload: {
        reason: 'Programme renamed',
        changes: { name: { from: 'Route A', to: 'Route B' } },
      },
    });
  });

  it('archives a project with a reason; an archived project no longer changes and is never deleted', async () => {
    const { project } = await projects.create(command(adminA), input());
    const archived = await projects.archive(command(adminA), project.id, {
      version: 1,
      reason: 'Programme stopped',
    });
    expect(archived).toMatchObject({ status: 'ARCHIVED', archivedBy: 'admin-a', version: 2 });
    expect(archived.archivedAt).not.toBeNull();
    expect(
      await rejection(
        projects.update(command(adminA), project.id, { version: 2, reason: 'x', name: 'Back' }),
      ),
    ).toEqual({ type: ForbiddenException, code: 'SPEED_PROJECT_ARCHIVED' });
    expect(
      await rejection(
        projects.archive(command(adminA), project.id, { version: 2, reason: 'again' }),
      ),
    ).toEqual({ type: ForbiddenException, code: 'SPEED_PROJECT_ARCHIVED' });
    const runtime = new pg.Client({ connectionString: runtimeUrl });
    await runtime.connect();
    try {
      await runtime.query('BEGIN');
      await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await expect(
        runtime.query('DELETE FROM gigalibs_speed.projects WHERE id = $1', [project.id]),
      ).rejects.toMatchObject({ code: '55000' });
      await runtime.query('ROLLBACK');
      await runtime.query('BEGIN');
      await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await expect(
        runtime.query('UPDATE gigalibs_speed.audit_events SET action = $1', ['TAMPERED']),
      ).rejects.toMatchObject({ code: '42501' });
      await runtime.query('ROLLBACK');
    } finally {
      await runtime.end();
    }
  });

  it('lists with search, status filter, sorting and paging', async () => {
    const tag = randomUUID().slice(0, 6);
    for (const code of ['C', 'A', 'B'])
      await projects.create(
        command(adminA),
        input({ code: `${tag}-${code}`, name: `Search ${tag} ${code}` }),
      );
    const page = await projects.list(adminA, {
      page: 1,
      pageSize: 2,
      search: tag,
      sortField: 'code',
      sortDirection: 'ASC',
      status: 'ACTIVE',
    });
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.code)).toEqual([`${tag}-A`, `${tag}-B`]);
    const next = await projects.list(adminA, {
      page: 2,
      pageSize: 2,
      search: tag,
      sortField: 'code',
      sortDirection: 'ASC',
    });
    expect(next.items.map((item) => item.code)).toEqual([`${tag}-C`]);
    expect((await projects.list(adminA, { page: 1, pageSize: 10, search: '%' })).items).toEqual([]);
  });

  describe('through the metadata window (record dispatcher)', () => {
    it("creates with the window's rules: required fields, and the owner defaults to the signed-in user", async () => {
      const key = randomUUID();
      const context = { principal: northChemist, correlationId: randomUUID(), idempotencyKey: key };
      const created = await records.create(
        context,
        'speed.projects',
        { code: `W-${key.slice(0, 6)}`, name: 'From the window', 'site-unit-id': 'north' },
        key,
      );
      expect(created).toMatchObject({
        name: 'From the window',
        'site-unit-id': 'north',
        'owner-subject': 'chemist-north',
        status: 'ACTIVE',
        version: 1,
      });
      const missing = randomUUID();
      await expect(
        records.create(
          { principal: northChemist, correlationId: randomUUID(), idempotencyKey: missing },
          'speed.projects',
          { code: 'W-NONAME', 'site-unit-id': 'north' },
          missing,
        ),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('refuses a reader who tries to create, and archives with a reason at the current version (stale: 412)', async () => {
      const readerKey = randomUUID();
      await expect(
        records.create(
          { principal: northReader, correlationId: randomUUID(), idempotencyKey: readerKey },
          'speed.projects',
          { code: 'W-R', name: 'Reader', 'site-unit-id': 'north' },
          readerKey,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const { project } = await projects.create(command(northChemist), input());
      const stale = randomUUID();
      const refused = await rejection(
        records.action(
          { principal: northChemist, correlationId: randomUUID() },
          'speed.projects',
          project.id,
          'archive',
          { expectedVersion: 5, reason: 'Stopped' },
          stale,
        ),
      );
      expect(refused.code).toBe('RECORD_VERSION_CONFLICT');
      const key = randomUUID();
      const archived = await records.action(
        { principal: northChemist, correlationId: randomUUID() },
        'speed.projects',
        project.id,
        'archive',
        { expectedVersion: 1, reason: 'Stopped' },
        key,
      );
      expect(archived).toMatchObject({ status: 'ARCHIVED', version: 2 });
    });

    it('lists only the projects of the units the member may read', async () => {
      const page = await records.list(northChemist, 'speed.projects', {
        page: '1',
        pageSize: '100',
      });
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.every((item) => item['site-unit-id'] === 'north')).toBe(true);
    });
  });
});
