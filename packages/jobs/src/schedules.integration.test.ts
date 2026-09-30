import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KernelJobs } from './kernel-jobs.js';
import { PostgresJobStore } from './postgres-store.js';
import { JobRegistry } from './registry.js';
import { KernelScheduler, PostgresScheduleStore } from './schedules.js';

const databaseUrl = process.env.JOBS_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

// WI-OI-104c: recurring schedules against a real PostgreSQL with the kernel job migrations applied.
integration('kernel schedules on PostgreSQL', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const tenantA = `sched-a-${randomUUID()}`;
  const tenantB = `sched-b-${randomUUID()}`;
  let clock = new Date('2026-09-30T01:55:00.000Z');
  const owners = new Map<string, number>();
  const registry = new JobRegistry();
  registry.register<{ reportId: string }>({
    type: 'analytics.report-run',
    version: 1,
    backend: 'POSTGRES',
    maxAttempts: 3,
    timeoutMs: 60_000,
    backoff: { baseMs: 1_000, maxMs: 60_000 },
    parsePayload: (value) => {
      const reportId = (value as { reportId?: unknown })?.reportId;
      if (typeof reportId !== 'string') throw new Error('reportId is required');
      return { reportId };
    },
    handler: async () => ({ ok: true }),
  });
  const store = new PostgresScheduleStore(pool);
  const jobs = new KernelJobs({ store: new PostgresJobStore(pool), registry, clock: () => clock });
  const scheduler = () =>
    new KernelScheduler({
      store,
      jobs,
      registry,
      clock: () => clock,
      resolveOwner: async (tenantId, subject) => {
        const version = owners.get(`${tenantId}:${subject}`);
        return version === undefined ? null : { authVersion: version };
      },
    });
  const jobsFor = async (tenantId: string) =>
    (await pool.query(`SELECT "idempotencyKey", "ownerAuthVersion", "correlationId" FROM "kernel_job_runs" WHERE "tenantId" = $1 ORDER BY "createdAt"`, [tenantId]))
      .rows;

  beforeAll(async () => {
    await pool.query('INSERT INTO "tenants" ("id") VALUES ($1), ($2)', [tenantA, tenantB]);
  });
  beforeEach(() => {
    clock = new Date('2026-09-30T01:55:00.000Z');
    owners.set(`${tenantA}:owner-1`, 4);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('validates and stores a schedule, visible only to its tenant', async () => {
    const created = await scheduler().create({
      tenantId: tenantA,
      name: 'Nightly yield report',
      jobType: 'analytics.report-run',
      jobVersion: 1,
      payload: { reportId: 'r-1' },
      cron: '0 2 * * *',
      ownerSubjectId: 'owner-1',
    });
    expect(created.nextRunAt.toISOString()).toBe('2026-09-30T02:00:00.000Z');
    expect(await store.get(tenantB, created.id)).toBeNull();
    expect((await store.list(tenantA)).map((schedule) => schedule.name)).toContain('Nightly yield report');
    await expect(
      scheduler().create({ tenantId: tenantA, name: 'Bad', jobType: 'analytics.report-run', jobVersion: 1, payload: {}, cron: '0 2 * * *', ownerSubjectId: 'owner-1' }),
    ).rejects.toThrow('reportId is required');
    await expect(
      scheduler().create({ tenantId: tenantA, name: 'Bad cron', jobType: 'analytics.report-run', jobVersion: 1, payload: { reportId: 'r' }, cron: '0 25 * * *', ownerSubjectId: 'owner-1' }),
    ).rejects.toThrow('hour');
  });

  it('runs each due time exactly once even with two workers, as the owner, and advances to the next time', async () => {
    const created = await scheduler().create({
      tenantId: tenantA,
      name: 'Twice-guarded',
      jobType: 'analytics.report-run',
      jobVersion: 1,
      payload: { reportId: 'r-2' },
      cron: '0 2 * * *',
      ownerSubjectId: 'owner-1',
    });
    clock = new Date('2026-09-30T02:00:30.000Z');
    const handled = await Promise.all([scheduler().tick(), scheduler().tick()]);
    expect(handled.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(1);
    const runs = (await jobsFor(tenantA)).filter((job) => job.correlationId === `schedule:${created.id}`);
    expect(runs).toEqual([{ idempotencyKey: `schedule:${created.id}:2026-09-30T02:00:00.000Z`, ownerAuthVersion: 4, correlationId: `schedule:${created.id}` }]);
    const after = await store.get(tenantA, created.id);
    expect(after?.nextRunAt.toISOString()).toBe('2026-10-01T02:00:00.000Z');
    expect(after?.lastRunAt?.toISOString()).toBe('2026-09-30T02:00:00.000Z');
  });

  it('collapses missed times into one run and never duplicates after a crash between enqueue and advance', async () => {
    const created = await scheduler().create({
      tenantId: tenantA,
      name: 'Hourly while down',
      jobType: 'analytics.report-run',
      jobVersion: 1,
      payload: { reportId: 'r-3' },
      cron: '0 * * * *',
      ownerSubjectId: 'owner-1',
    });
    // The worker was down for five hours: one run, then the next hour after now.
    clock = new Date('2026-09-30T07:20:00.000Z');
    // A previous worker enqueued the job for this due time, then crashed before advancing the schedule.
    await jobs.enqueue({
      tenantId: tenantA,
      type: 'analytics.report-run',
      version: 1,
      payload: { reportId: 'r-3' },
      ownerSubjectId: 'owner-1',
      ownerAuthVersion: 4,
      correlationId: `schedule:${created.id}`,
      idempotencyKey: `schedule:${created.id}:2026-09-30T02:00:00.000Z`,
    });
    await scheduler().tick();
    const runs = (await jobsFor(tenantA)).filter((job) => job.correlationId === `schedule:${created.id}`);
    expect(runs).toHaveLength(1);
    expect((await store.get(tenantA, created.id))?.nextRunAt.toISOString()).toBe('2026-09-30T08:00:00.000Z');
  });

  it('pauses a schedule whose owner is no longer an active member, and resumes from now', async () => {
    const created = await scheduler().create({
      tenantId: tenantA,
      name: 'Owner left',
      jobType: 'analytics.report-run',
      jobVersion: 1,
      payload: { reportId: 'r-4' },
      cron: '0 2 * * *',
      ownerSubjectId: 'owner-gone',
    });
    clock = new Date('2026-09-30T02:05:00.000Z');
    await scheduler().tick();
    const paused = await store.get(tenantA, created.id);
    expect(paused?.status).toBe('PAUSED');
    expect(paused?.pausedReason).toMatch(/no longer an active member/);
    expect((await jobsFor(tenantA)).some((job) => job.correlationId === `schedule:${created.id}`)).toBe(false);
    const resumed = await scheduler().resume(tenantA, created.id);
    expect([resumed?.status, resumed?.nextRunAt.toISOString()]).toEqual(['ACTIVE', '2026-10-01T02:00:00.000Z']);
  });

  it('hands a resumed schedule to a new owner, lists its runs, and removes it within its tenant only', async () => {
    const created = await scheduler().create({
      tenantId: tenantA,
      name: 'Handed over',
      jobType: 'analytics.report-run',
      jobVersion: 1,
      payload: { reportId: 'r-5' },
      cron: '0 2 * * *',
      ownerSubjectId: 'owner-gone',
    });
    clock = new Date('2026-09-30T02:05:00.000Z');
    await scheduler().tick();
    const handed = await scheduler().resume(tenantA, created.id, 'owner-1');
    expect([handed?.status, handed?.ownerSubjectId]).toEqual(['ACTIVE', 'owner-1']);
    clock = new Date('2026-10-01T02:00:10.000Z');
    await scheduler().tick();
    const jobStore = new PostgresJobStore(pool);
    const runs = await jobStore.listByCorrelationForTenant(tenantA, `schedule:${created.id}`, 10);
    expect(runs.map((run) => [run.ownerSubjectId, run.ownerAuthVersion])).toEqual([['owner-1', 4]]);
    expect(await jobStore.listByCorrelationForTenant(tenantB, `schedule:${created.id}`, 10)).toEqual([]);
    const latest = await jobStore.latestByCorrelationForTenant(tenantA, [`schedule:${created.id}`, 'schedule:none']);
    expect([...latest.keys()]).toEqual([`schedule:${created.id}`]);
    expect(await store.remove(tenantB, created.id)).toBe(false);
    expect(await scheduler().remove(tenantA, created.id)).toBe(true);
    expect(await store.get(tenantA, created.id)).toBeNull();
    expect(await jobStore.listByCorrelationForTenant(tenantA, `schedule:${created.id}`, 10)).toHaveLength(1);
  });
});
