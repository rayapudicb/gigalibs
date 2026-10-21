import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ListSpeedAuditQueryV1Schema } from '@gigalibs/contracts';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CriteriaService } from '../criteria/criteria.service.js';
import { LibraryService } from '../library/library.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { RoutesService } from '../routes/routes.service.js';
import { StepsService } from '../routes/steps.service.js';
import {
  type SpeedDatabase,
  adminUrl,
  principal,
  seedOrganization,
  speedDatabase,
} from '../test-support/speed-database.js';
import { AuditTrailService } from './audit-trail.service.js';

// WI-OI-120cc (SPEED; screen spec §3.3; FR-AUD-01, 02): the audit trail from SPEED's append-only audit table. TEST
// FIXTURE records only.

const TENANT = `tenant-audit-${randomUUID().slice(0, 8)}`;
const WRITE = ['speed:read', 'speed.routes.read', 'speed.routes.write'];
const reviewer = principal(TENANT, 'reviewer', [...WRITE, 'speed.audit.read']);
const chemist = principal(TENANT, 'chemist', [...WRITE, 'speed.audit.read-own']);
const outsider = principal(TENANT, 'outsider', WRITE);
const as = (who: ModulePrincipal): ModuleCommandContext => ({
  principal: who,
  correlationId: randomUUID(),
});
const query = (raw: Record<string, unknown> = {}) => ListSpeedAuditQueryV1Schema.parse(raw);

describe.skipIf(!adminUrl)('SPEED audit trail (WI-OI-120cc)', () => {
  let speed: SpeedDatabase;
  let audit: AuditTrailService;
  let routeId = '';
  let started = '';

  beforeAll(async () => {
    speed = await speedDatabase('audit');
    await seedOrganization(speed.admin, TENANT);
    const criteria = new CriteriaService(speed.database);
    const library = new LibraryService(speed.database);
    const routes = new RoutesService(speed.database, criteria, library);
    const steps = new StepsService(speed.database, criteria, library);
    audit = new AuditTrailService(speed.database);
    started = new Date(Date.now() - 1000).toISOString();
    const projectId = (
      await new ProjectsService(speed.database).create(as(reviewer), {
        requestKey: randomUUID(),
        code: 'AUD',
        name: 'Audit (TEST FIXTURE)',
        siteUnitId: 'north',
      })
    ).project.id;
    const route = (
      await routes.create(as(chemist), { requestKey: randomUUID(), projectId, name: 'First name' })
    ).route;
    routeId = route.id;
    await routes.update(as(chemist), routeId, {
      version: route.version,
      reason: 'Clearer name',
      name: '=Second name',
    });
    await steps.addStep(as(chemist), routeId, {
      requestKey: randomUUID(),
      reason: 'Data entry',
      name: 'Step one',
    });
    // Another route, so the route filter has something to leave out.
    await routes.create(as(reviewer), { requestKey: randomUUID(), projectId, name: 'Other route' });
  }, 120_000);

  afterAll(async () => {
    await speed?.close();
  });

  it('reads every entry with speed.audit.read, newest first, with field changes and reasons', async () => {
    const page = await audit.list(reviewer, query());
    expect(page.ownOnly).toBe(false);
    expect(page.items.map((entry) => entry.actor)).toEqual(
      expect.arrayContaining(['chemist', 'reviewer']),
    );
    const times = page.items.map((entry) => entry.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    // A creation records its fields as changes from nothing; the rename is the change from the first name.
    const renamed = page.items.find((entry) =>
      entry.changes.some((change) => change.field === 'name' && change.from === 'First name'),
    );
    expect(renamed).toMatchObject({
      actor: 'chemist',
      reason: 'Clearer name',
      changes: expect.arrayContaining([{ field: 'name', from: 'First name', to: '=Second name' }]),
    });
  });

  it('reads only the member’s own entries with speed.audit.read-own, and refuses anyone else', async () => {
    const own = await audit.list(chemist, query());
    expect(own.ownOnly).toBe(true);
    expect(own.items.length).toBeGreaterThan(0);
    expect(own.items.every((entry) => entry.actor === 'chemist')).toBe(true);
    await expect(audit.list(outsider, query())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters by route (its own entries and its steps’), action, person and time', async () => {
    const byRoute = await audit.list(reviewer, query({ routeId }));
    expect(byRoute.items.length).toBeGreaterThanOrEqual(3);
    expect(byRoute.items.some((entry) => entry.entityType === 'step')).toBe(true);
    expect(byRoute.items.every((entry) => entry.actor === 'chemist')).toBe(true);
    const actions = await audit.list(reviewer, query({ action: byRoute.items[0]?.action }));
    expect(actions.items.every((entry) => entry.action === byRoute.items[0]?.action)).toBe(true);
    expect(
      (await audit.list(reviewer, query({ actor: 'reviewer' }))).items.every(
        (entry) => entry.actor === 'reviewer',
      ),
    ).toBe(true);
    expect((await audit.list(reviewer, query({ to: started }))).total).toBe(0);
    expect((await audit.list(reviewer, query({ from: started }))).total).toBeGreaterThan(0);
  });

  it('pages the trail', async () => {
    const all = await audit.list(reviewer, query({ pageSize: 200 }));
    const first = await audit.list(reviewer, query({ pageSize: 2, page: 1 }));
    const second = await audit.list(reviewer, query({ pageSize: 2, page: 2 }));
    expect(first.total).toBe(all.total);
    expect([...first.items, ...second.items].map((entry) => entry.id)).toEqual(
      all.items.slice(0, 4).map((entry) => entry.id),
    );
  });

  it('exports CSV with one line per changed field, keeping a formula-like value as text', async () => {
    const csv = await audit.csv(reviewer, query({ routeId }));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('time_utc,user,action,record_type,record_id,field,old,new,reason');
    expect(lines.some((line) => line.includes(",name,First name,'=Second name,Clearer name"))).toBe(
      true,
    );
  });
});
