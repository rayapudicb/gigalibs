import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { exponentialBackoffMs } from './backoff.js';
import { JobIdempotencyConflictError, JobLeaseConflictError } from './errors.js';
import type {
  JobAuditEvent,
  JobBackend,
  JobRecord,
  JobStatus,
  JobStore,
  JsonValue,
  StoredJobInput,
} from './types.js';
import { boundedMessage } from './validation.js';

interface JobRow extends QueryResultRow {
  id: string;
  tenantId: string;
  jobType: string;
  jobVersion: number;
  backend: JobBackend;
  status: JobStatus;
  payload: JsonValue;
  payloadSha256: string;
  ownerSubjectId: string;
  ownerAuthVersion: number;
  correlationId: string;
  idempotencyKey: string;
  maxAttempts: number;
  attempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  availableAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  dispatchStatus: 'NOT_REQUIRED' | 'PENDING' | 'DISPATCHED';
  dispatchAttempts: number;
  dispatchedAt: Date | null;
  dispatchLastError: string | null;
  resultSummary: JsonValue | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  auditSequence: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface AuditRow extends QueryResultRow {
  id: string;
  tenantId: string;
  jobId: string;
  sequence: number;
  eventType: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  attempt: number;
  workerId: string | null;
  correlationId: string;
  errorCode: string | null;
  createdAt: Date;
}

const TERMINAL_STATUSES: readonly JobStatus[] = ['SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'];
export const BULLMQ_REDISPATCH_AFTER_MS = 60_000;

export class PostgresJobStore implements JobStore {
  constructor(
    private readonly pool: Pool,
    private readonly workerPool: Pool = pool,
  ) {}

  async enqueue(
    input: StoredJobInput,
  ): Promise<{ readonly job: JobRecord; readonly created: boolean }> {
    return this.transaction(async (client) => {
      await setTenant(client, input.tenantId);
      const inserted = await client.query<JobRow>(
        `INSERT INTO "kernel_job_runs" (
           "id", "tenantId", "jobType", "jobVersion", "backend", "payload", "payloadSha256",
           "ownerSubjectId", "ownerAuthVersion", "correlationId", "idempotencyKey", "maxAttempts",
           "backoffBaseMs", "backoffMaxMs", "availableAt", "dispatchStatus", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5::"KernelJobBackend", $6::jsonb, $7,
           $8, $9, $10, $11, $12, $13, $14, $15,
           CASE WHEN $5 = 'BULLMQ' THEN 'PENDING'::"KernelJobDispatchStatus"
                ELSE 'NOT_REQUIRED'::"KernelJobDispatchStatus" END,
           $16, $16
         )
         ON CONFLICT ("tenantId", "jobType", "idempotencyKey") DO NOTHING
         RETURNING *`,
        [
          input.id,
          input.tenantId,
          input.jobType,
          input.jobVersion,
          input.backend,
          JSON.stringify(input.payload),
          input.payloadSha256,
          input.ownerSubjectId,
          input.ownerAuthVersion,
          input.correlationId,
          input.idempotencyKey,
          input.maxAttempts,
          input.backoffBaseMs,
          input.backoffMaxMs,
          input.availableAt,
          input.createdAt,
        ],
      );

      const newRow = inserted.rows[0];
      if (newRow) {
        await insertAudit(client, newRow, 'ENQUEUED', null, 'QUEUED', null, null, input.createdAt);
        return { job: mapJob(newRow), created: true };
      }

      const existing = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs"
         WHERE "tenantId" = $1 AND "jobType" = $2 AND "idempotencyKey" = $3`,
        [input.tenantId, input.jobType, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row)
        throw new Error(
          'The idempotent job exists but is not readable in the current tenant scope.',
        );
      if (
        row.payloadSha256 !== input.payloadSha256 ||
        row.jobVersion !== input.jobVersion ||
        row.backend !== input.backend ||
        row.ownerSubjectId !== input.ownerSubjectId ||
        row.ownerAuthVersion !== input.ownerAuthVersion ||
        row.availableAt.getTime() !== input.availableAt.getTime()
      ) {
        throw new JobIdempotencyConflictError(
          `Idempotency key '${input.idempotencyKey}' is already used by a different job request.`,
        );
      }
      return { job: mapJob(row), created: false };
    });
  }

  async claimNext(
    backend: JobBackend,
    workerId: string,
    leaseMs: number,
    now: Date,
  ): Promise<JobRecord | null> {
    return this.workerTransaction(async (client) => {
      await this.recoverExpiredLeases(client, now);
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs"
         WHERE "backend" = $1::"KernelJobBackend"
           AND "status" IN ('QUEUED', 'RETRY_WAIT')
           AND "availableAt" <= $2
         ORDER BY "availableAt", "createdAt", "id"
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [backend, now],
      );
      const row = selected.rows[0];
      return row ? this.claimLockedRow(client, row, workerId, leaseMs, now) : null;
    });
  }

  async claimById(
    jobId: string,
    backend: JobBackend,
    workerId: string,
    leaseMs: number,
    now: Date,
  ): Promise<JobRecord | null> {
    return this.workerTransaction(async (client) => {
      await this.recoverExpiredLeases(client, now, jobId);
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs"
         WHERE "id" = $1
           AND "backend" = $2::"KernelJobBackend"
           AND "status" IN ('QUEUED', 'RETRY_WAIT')
           AND "availableAt" <= $3
         FOR UPDATE SKIP LOCKED`,
        [jobId, backend, now],
      );
      const row = selected.rows[0];
      return row ? this.claimLockedRow(client, row, workerId, leaseMs, now) : null;
    });
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<boolean> {
    return this.workerTransaction(async (client) => {
      const result = await client.query(
        `UPDATE "kernel_job_runs"
         SET "heartbeatAt" = $3::timestamptz,
             "leaseExpiresAt" = $3::timestamptz + ($4 * interval '1 millisecond'),
             "updatedAt" = $3::timestamptz
         WHERE "id" = $1 AND "status" = 'RUNNING' AND "leaseOwner" = $2`,
        [jobId, workerId, now, leaseMs],
      );
      return result.rowCount === 1;
    });
  }

  async complete(
    jobId: string,
    workerId: string,
    result: JsonValue | null,
    now: Date,
  ): Promise<JobRecord> {
    return this.transitionRunning(jobId, workerId, now, async (client, row) => {
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "status" = 'SUCCEEDED', "resultSummary" = $3::jsonb, "completedAt" = $4,
             "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "heartbeatAt" = $4,
             "auditSequence" = "auditSequence" + 1, "updatedAt" = $4
         WHERE "id" = $1 AND "leaseOwner" = $2
         RETURNING *`,
        [jobId, workerId, result === null ? null : JSON.stringify(result), now],
      );
      const next = requiredRow(updated.rows[0], jobId);
      await insertAudit(client, next, 'SUCCEEDED', row.status, next.status, workerId, null, now);
      return mapJob(next);
    });
  }

  async fail(
    jobId: string,
    workerId: string,
    failure: { readonly code: string; readonly message: string; readonly retryAt: Date | null },
    now: Date,
  ): Promise<JobRecord> {
    return this.transitionRunning(jobId, workerId, now, async (client, row) => {
      const retry = failure.retryAt !== null && row.attempts < row.maxAttempts;
      const nextStatus: JobStatus = retry ? 'RETRY_WAIT' : 'DEAD_LETTER';
      const dispatchStatus = row.backend === 'BULLMQ' && retry ? 'PENDING' : row.dispatchStatus;
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "status" = $3::"KernelJobStatus", "availableAt" = COALESCE($4, "availableAt"),
             "completedAt" = CASE WHEN $3 = 'DEAD_LETTER' THEN $5 ELSE NULL END,
             "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "heartbeatAt" = $5,
             "dispatchStatus" = $6::"KernelJobDispatchStatus",
             "dispatchedAt" = CASE WHEN $6 = 'PENDING' THEN NULL ELSE "dispatchedAt" END,
             "lastErrorCode" = $7, "lastErrorMessage" = $8,
             "auditSequence" = "auditSequence" + 1, "updatedAt" = $5
         WHERE "id" = $1 AND "leaseOwner" = $2
         RETURNING *`,
        [
          jobId,
          workerId,
          nextStatus,
          failure.retryAt,
          now,
          dispatchStatus,
          failure.code.slice(0, 128),
          boundedMessage(failure.message),
        ],
      );
      const next = requiredRow(updated.rows[0], jobId);
      await insertAudit(
        client,
        next,
        retry ? 'RETRY_SCHEDULED' : 'DEAD_LETTERED',
        row.status,
        next.status,
        workerId,
        failure.code,
        now,
      );
      return mapJob(next);
    });
  }

  async cancel(tenantId: string, jobId: string, actorId: string, now: Date): Promise<JobRecord> {
    return this.transaction(async (client) => {
      await setTenant(client, tenantId);
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs" WHERE "tenantId" = $1 AND "id" = $2 FOR UPDATE`,
        [tenantId, jobId],
      );
      const row = requiredRow(selected.rows[0], jobId);
      if (TERMINAL_STATUSES.includes(row.status)) return mapJob(row);
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "status" = 'CANCELLED', "completedAt" = $3, "leaseOwner" = NULL,
             "leaseExpiresAt" = NULL, "auditSequence" = "auditSequence" + 1, "updatedAt" = $3
         WHERE "tenantId" = $1 AND "id" = $2 RETURNING *`,
        [tenantId, jobId, now],
      );
      const next = requiredRow(updated.rows[0], jobId);
      await insertAudit(client, next, 'CANCELLED', row.status, next.status, actorId, null, now);
      return mapJob(next);
    });
  }

  async listPendingDispatch(limit: number, now: Date): Promise<readonly JobRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    return this.workerTransaction(async (client) => {
      const result = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs"
         WHERE "backend" = 'BULLMQ'
           AND "status" IN ('QUEUED', 'RETRY_WAIT')
           AND (
             ("dispatchStatus" = 'PENDING' AND "availableAt" <= $1::timestamptz)
             OR (
               "dispatchStatus" = 'DISPATCHED'
               AND "dispatchedAt" <= $1::timestamptz - ($3 * interval '1 millisecond')
             )
           )
         ORDER BY "availableAt", "createdAt", "id"
         LIMIT $2`,
        [now, boundedLimit, BULLMQ_REDISPATCH_AFTER_MS],
      );
      return result.rows.map(mapJob);
    });
  }

  async markDispatched(jobId: string, now: Date): Promise<void> {
    await this.workerTransaction(async (client) => {
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs" WHERE "id" = $1 FOR UPDATE`,
        [jobId],
      );
      const row = requiredRow(selected.rows[0], jobId);
      if (row.backend !== 'BULLMQ' || TERMINAL_STATUSES.includes(row.status)) return;
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "dispatchStatus" = 'DISPATCHED', "dispatchAttempts" = "dispatchAttempts" + 1,
             "dispatchedAt" = $2, "dispatchLastError" = NULL,
             "auditSequence" = "auditSequence" + 1, "updatedAt" = $2
         WHERE "id" = $1 RETURNING *`,
        [jobId, now],
      );
      const next = requiredRow(updated.rows[0], jobId);
      await insertAudit(client, next, 'DISPATCHED', row.status, row.status, null, null, now);
    });
  }

  async markDispatchFailed(jobId: string, message: string, now: Date): Promise<void> {
    await this.workerTransaction(async (client) => {
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs" WHERE "id" = $1 FOR UPDATE`,
        [jobId],
      );
      const row = requiredRow(selected.rows[0], jobId);
      if (row.backend !== 'BULLMQ' || TERMINAL_STATUSES.includes(row.status)) return;
      const retryAt = new Date(
        now.getTime() +
          exponentialBackoffMs(row.dispatchAttempts + 1, row.backoffBaseMs, row.backoffMaxMs),
      );
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "dispatchStatus" = 'PENDING', "dispatchAttempts" = "dispatchAttempts" + 1,
             "dispatchLastError" = $2, "availableAt" = $3,
             "auditSequence" = "auditSequence" + 1, "updatedAt" = $4
         WHERE "id" = $1 RETURNING *`,
        [jobId, boundedMessage(message), retryAt, now],
      );
      const next = requiredRow(updated.rows[0], jobId);
      await insertAudit(
        client,
        next,
        'DISPATCH_FAILED',
        row.status,
        row.status,
        null,
        'DISPATCH_FAILED',
        now,
      );
    });
  }

  async getForTenant(tenantId: string, jobId: string): Promise<JobRecord | null> {
    return this.transaction(async (client) => {
      await setTenant(client, tenantId);
      const result = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs" WHERE "tenantId" = $1 AND "id" = $2`,
        [tenantId, jobId],
      );
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    });
  }

  async listAuditForTenant(tenantId: string, jobId: string): Promise<readonly JobAuditEvent[]> {
    return this.transaction(async (client) => {
      await setTenant(client, tenantId);
      const result = await client.query<AuditRow>(
        `SELECT * FROM "kernel_job_audit_events"
         WHERE "tenantId" = $1 AND "jobId" = $2 ORDER BY "sequence"`,
        [tenantId, jobId],
      );
      return result.rows.map(mapAudit);
    });
  }

  private async claimLockedRow(
    client: PoolClient,
    row: JobRow,
    workerId: string,
    leaseMs: number,
    now: Date,
  ): Promise<JobRecord> {
    const updated = await client.query<JobRow>(
      `UPDATE "kernel_job_runs"
       SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "leaseOwner" = $2,
           "leaseExpiresAt" = $3::timestamptz + ($4 * interval '1 millisecond'),
           "heartbeatAt" = $3::timestamptz,
           "startedAt" = COALESCE("startedAt", $3::timestamptz), "auditSequence" = "auditSequence" + 1,
           "updatedAt" = $3::timestamptz
       WHERE "id" = $1 RETURNING *`,
      [row.id, workerId, now, leaseMs],
    );
    const next = requiredRow(updated.rows[0], row.id);
    await insertAudit(client, next, 'STARTED', row.status, next.status, workerId, null, now);
    return mapJob(next);
  }

  private async recoverExpiredLeases(client: PoolClient, now: Date, jobId?: string): Promise<void> {
    const expired = await client.query<JobRow>(
      `SELECT * FROM "kernel_job_runs"
       WHERE "status" = 'RUNNING' AND "leaseExpiresAt" <= $1
         AND ($2::text IS NULL OR "id" = $2)
       ORDER BY "leaseExpiresAt", "id"
       FOR UPDATE SKIP LOCKED
       LIMIT 100`,
      [now, jobId ?? null],
    );
    for (const row of expired.rows) {
      const retry = row.attempts < row.maxAttempts;
      const nextStatus: JobStatus = retry ? 'RETRY_WAIT' : 'DEAD_LETTER';
      const retryAt = retry
        ? new Date(
            now.getTime() + exponentialBackoffMs(row.attempts, row.backoffBaseMs, row.backoffMaxMs),
          )
        : row.availableAt;
      const dispatchStatus = row.backend === 'BULLMQ' && retry ? 'PENDING' : row.dispatchStatus;
      const updated = await client.query<JobRow>(
        `UPDATE "kernel_job_runs"
         SET "status" = $2::"KernelJobStatus", "availableAt" = $3,
             "completedAt" = CASE WHEN $2 = 'DEAD_LETTER' THEN $4 ELSE NULL END,
             "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "dispatchStatus" = $5::"KernelJobDispatchStatus",
             "dispatchedAt" = CASE WHEN $5 = 'PENDING' THEN NULL ELSE "dispatchedAt" END,
             "lastErrorCode" = 'LEASE_EXPIRED', "lastErrorMessage" = 'The worker lease expired.',
             "auditSequence" = "auditSequence" + 1, "updatedAt" = $4
         WHERE "id" = $1 RETURNING *`,
        [row.id, nextStatus, retryAt, now, dispatchStatus],
      );
      const next = requiredRow(updated.rows[0], row.id);
      await insertAudit(
        client,
        next,
        retry ? 'LEASE_RECOVERED' : 'DEAD_LETTERED',
        row.status,
        next.status,
        row.leaseOwner,
        'LEASE_EXPIRED',
        now,
      );
    }
  }

  private async transitionRunning<T>(
    jobId: string,
    workerId: string,
    now: Date,
    transition: (client: PoolClient, row: JobRow) => Promise<T>,
  ): Promise<T> {
    return this.workerTransaction(async (client) => {
      const selected = await client.query<JobRow>(
        `SELECT * FROM "kernel_job_runs" WHERE "id" = $1 FOR UPDATE`,
        [jobId],
      );
      const row = requiredRow(selected.rows[0], jobId);
      if (
        row.status !== 'RUNNING' ||
        row.leaseOwner !== workerId ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt <= now
      ) {
        throw new JobLeaseConflictError(
          `Worker '${workerId}' does not hold a live lease for job '${jobId}'.`,
        );
      }
      return transition(client, row);
    });
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Tenant-facing access always assumes the constrained RLS role, even when local development
      // connects with a database owner. Missing membership is a deliberate fail-closed error.
      await client.query('SET LOCAL ROLE gigalibs_jobs_tenant');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async workerTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.workerPool.connect();
    try {
      await client.query('BEGIN');
      // The connection user must be an explicitly granted member. Failure is intentional and fail-closed.
      await client.query('SET LOCAL ROLE gigalibs_jobs_worker');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function insertAudit(
  client: PoolClient,
  row: JobRow,
  eventType: string,
  fromStatus: JobStatus | null,
  toStatus: JobStatus,
  workerId: string | null,
  errorCode: string | null,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO "kernel_job_audit_events" (
       "id", "tenantId", "jobId", "sequence", "eventType", "fromStatus", "toStatus",
       "attempt", "workerId", "correlationId", "errorCode", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5, $6::"KernelJobStatus", $7::"KernelJobStatus", $8, $9, $10, $11, $12)`,
    [
      randomUUID(),
      row.tenantId,
      row.id,
      row.auditSequence,
      eventType,
      fromStatus,
      toStatus,
      row.attempts,
      workerId,
      row.correlationId,
      errorCode,
      now,
    ],
  );
}

function requiredRow(row: JobRow | undefined, jobId: string): JobRow {
  if (!row) throw new Error(`Job '${jobId}' was not found.`);
  return row;
}

function mapJob(row: JobRow): JobRecord {
  return { ...row };
}

function mapAudit(row: AuditRow): JobAuditEvent {
  return { ...row };
}
