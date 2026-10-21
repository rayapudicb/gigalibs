import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { CreateSpeedProjectInputV1 } from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  ModuleIdempotencyStore,
  type ModulePrincipal,
  type RecordDispatcher,
} from '@gigalibs/module-sdk';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CriteriaService } from '../criteria/criteria.service.js';
import { LibraryService } from '../library/library.service.js';
import { RoutesService } from '../routes/routes.service.js';
import { SubstancesService } from '../substances/substances.service.js';
import {
  type SpeedDatabase,
  TREE,
  adminUrl,
  principal,
  seedOrganization,
  speedDatabase,
  units,
} from '../test-support/speed-database.js';
import { speedRecordDispatcher } from './projects-record-adapters.js';
import { ProjectsService } from './projects.service.js';

// WI-OI-120bw (SPEED S3): projects on PostgreSQL 16, as the least-privileged runtime role the module migration runner
// creates, under forced row-level security (opt-in; see test-support/speed-database.ts).

const TENANT_A = `tenant-a-${randomUUID().slice(0, 8)}`;
const TENANT_B = `tenant-b-${randomUUID().slice(0, 8)}`;
const READ = ['speed:read', 'speed.routes.read'];
const WRITE = [...READ, 'speed.routes.write'];

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
  let speed: SpeedDatabase;
  let admin: pg.Client;
  let projects: ProjectsService;
  let records: RecordDispatcher;
  // A tenant-wide administrator in each tenant, and two site members in tenant A.
  const adminA = principal(TENANT_A, 'admin-a', WRITE);
  const adminB = principal(TENANT_B, 'admin-b', WRITE);
  const northChemist = principal(TENANT_A, 'chemist-north', WRITE, units(['north']));
  const northReader = principal(TENANT_A, 'reader-north', READ, units(['north']));

  beforeAll(async () => {
    speed = await speedDatabase('projects');
    admin = speed.admin;
    await seedOrganization(admin, TENANT_A);
    projects = new ProjectsService(speed.database);
    records = speedRecordDispatcher(
      {
        projects,
        criteria: new CriteriaService(speed.database),
        library: new LibraryService(speed.database),
        substances: new SubstancesService(
          speed.database,
          new CriteriaService(speed.database),
          new LibraryService(speed.database),
        ),
        routes: new RoutesService(
          speed.database,
          new CriteriaService(speed.database),
          new LibraryService(speed.database),
        ),
      },
      new ModuleIdempotencyStore(speed.database, { retentionDays: 7 }),
    );
  });

  afterAll(async () => {
    await speed?.close();
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
    await speed.asRuntime(TENANT_A, async (runtime) => {
      await expect(
        runtime.query('DELETE FROM gigalibs_speed.projects WHERE id = $1', [project.id]),
      ).rejects.toMatchObject({ code: '55000' });
    });
    await speed.asRuntime(TENANT_A, async (runtime) => {
      await expect(
        runtime.query('UPDATE gigalibs_speed.audit_events SET action = $1', ['TAMPERED']),
      ).rejects.toMatchObject({ code: '42501' });
    });
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
