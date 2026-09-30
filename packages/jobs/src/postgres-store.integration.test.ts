import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobIdempotencyConflictError } from './errors.js';
import { BULLMQ_REDISPATCH_AFTER_MS, PostgresJobStore } from './postgres-store.js';
import type { StoredJobInput } from './types.js';

const databaseUrl = process.env.JOBS_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration('PostgresJobStore real PostgreSQL lifecycle', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresJobStore(pool);
  const tenantA = `jobs-proof-a-${randomUUID()}`;
  const tenantB = `jobs-proof-b-${randomUUID()}`;
  const now = new Date('2026-09-30T11:00:00.000Z');

  beforeAll(async () => {
    await pool.query(
      'TRUNCATE TABLE "kernel_job_audit_events", "kernel_job_runs", "tenants" CASCADE',
    );
    await pool.query('INSERT INTO "tenants" ("id") VALUES ($1), ($2)', [tenantA, tenantB]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enforces tenant RLS and a leased worker lifecycle with transactional audit', async () => {
    const input = makeInput(tenantA, now);
    const accepted = await store.enqueue(input);
    const duplicate = await store.enqueue(input);

    expect(accepted.created).toBe(true);
    expect(duplicate.created).toBe(false);
    await expect(store.getForTenant(tenantB, input.id)).resolves.toBeNull();
    await expect(store.getForTenant(tenantA, input.id)).resolves.toMatchObject({
      status: 'QUEUED',
    });

    const running = await store.claimNext('POSTGRES', 'worker-proof', 30_000, now);
    expect(running).toMatchObject({
      id: input.id,
      tenantId: tenantA,
      status: 'RUNNING',
      attempts: 1,
    });
    await expect(store.heartbeat(input.id, 'other-worker', 30_000, now)).resolves.toBe(false);
    await expect(store.heartbeat(input.id, 'worker-proof', 30_000, now)).resolves.toBe(true);

    const completed = await store.complete(input.id, 'worker-proof', { rows: 3 }, now);
    expect(completed).toMatchObject({ status: 'SUCCEEDED', resultSummary: { rows: 3 } });
    await expect(store.listAuditForTenant(tenantB, input.id)).resolves.toEqual([]);
    await expect(store.listAuditForTenant(tenantA, input.id)).resolves.toMatchObject([
      { sequence: 1, eventType: 'ENQUEUED', toStatus: 'QUEUED' },
      { sequence: 2, eventType: 'STARTED', toStatus: 'RUNNING' },
      { sequence: 3, eventType: 'SUCCEEDED', toStatus: 'SUCCEEDED' },
    ]);
  });

  it('rejects changed input under the same idempotency key', async () => {
    const input = makeInput(tenantA, new Date(now.getTime() + 1_000));
    await store.enqueue(input);

    await expect(
      store.enqueue({ ...input, id: randomUUID(), payloadSha256: 'b'.repeat(64) }),
    ).rejects.toBeInstanceOf(JobIdempotencyConflictError);
  });

  it('backs off Redis failures and redelivers stale transient dispatches from PostgreSQL truth', async () => {
    const input = makeInput(tenantA, now, { backend: 'BULLMQ' });
    await store.enqueue(input);

    await expect(store.listPendingDispatch(10, now)).resolves.toMatchObject([{ id: input.id }]);
    await store.markDispatched(input.id, now);
    await expect(store.listPendingDispatch(10, now)).resolves.toEqual([]);
    await expect(
      store.listPendingDispatch(10, new Date(now.getTime() + BULLMQ_REDISPATCH_AFTER_MS)),
    ).resolves.toMatchObject([{ id: input.id }]);

    await store.markDispatchFailed(input.id, 'redis unavailable', now);
    await expect(store.listPendingDispatch(10, now)).resolves.toEqual([]);
    await expect(
      store.listPendingDispatch(10, new Date(now.getTime() + 200)),
    ).resolves.toMatchObject([
      { id: input.id, dispatchStatus: 'PENDING', dispatchLastError: 'redis unavailable' },
    ]);
  });

  it('does not grant tenant or worker roles destructive audit access', async () => {
    for (const role of ['gigalibs_jobs_tenant', 'gigalibs_jobs_worker']) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query('DELETE FROM "kernel_job_audit_events"')).rejects.toThrow(
          /permission denied/,
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  });
});

function makeInput(
  tenantId: string,
  now: Date,
  overrides: Partial<StoredJobInput> = {},
): StoredJobInput {
  return {
    id: randomUUID(),
    tenantId,
    jobType: 'analytics.summary-build',
    jobVersion: 1,
    backend: 'POSTGRES',
    payload: { sourceId: 'source-a' },
    payloadSha256: 'a'.repeat(64),
    ownerSubjectId: 'user-a',
    ownerAuthVersion: 7,
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    maxAttempts: 3,
    backoffBaseMs: 100,
    backoffMaxMs: 1_000,
    availableAt: now,
    createdAt: now,
    ...overrides,
  };
}
