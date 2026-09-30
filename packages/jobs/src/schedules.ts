/**
 * Recurring schedules (WI-OI-104c). A schedule turns into one kernel job per due time. The scheduler claims due
 * schedules with `FOR UPDATE SKIP LOCKED`, so several workers never run the same due time twice, and the job
 * idempotency key `schedule:<id>:<due time>` makes a crash between enqueueing and advancing harmless. A worker that
 * was down runs a missed schedule once, then continues from now. The owner is re-checked at every due time: a
 * schedule whose owner is no longer an active member pauses instead of running.
 */

import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { CronExpressionError, assertTimeZone, nextCronRun, parseCron } from './cron.js';
import { JobDefinitionError } from './errors.js';
import type { KernelJobs } from './kernel-jobs.js';
import type { JobRegistry } from './registry.js';
import type { JsonValue } from './types.js';

export type ScheduleStatus = 'ACTIVE' | 'PAUSED';

export interface ScheduleRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly jobType: string;
  readonly jobVersion: number;
  readonly payload: JsonValue;
  readonly cron: string;
  readonly timeZone: string;
  readonly status: ScheduleStatus;
  readonly pausedReason: string | null;
  readonly ownerSubjectId: string;
  readonly nextRunAt: Date;
  readonly lastRunAt: Date | null;
  readonly lastJobId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateScheduleCommand {
  readonly tenantId: string;
  readonly name: string;
  readonly jobType: string;
  readonly jobVersion: number;
  readonly payload: unknown;
  readonly cron: string;
  readonly timeZone?: string;
  readonly ownerSubjectId: string;
}

/** The owner's current standing, or null when they are no longer an active member of the tenant. */
export type ScheduleOwnerResolver = (tenantId: string, subjectId: string) => Promise<{ readonly authVersion: number } | null>;

interface ScheduleRow extends QueryResultRow {
  id: string;
  tenantId: string;
  name: string;
  jobType: string;
  jobVersion: number;
  payload: JsonValue;
  cron: string;
  timeZone: string;
  status: ScheduleStatus;
  pausedReason: string | null;
  ownerSubjectId: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS =
  '"id", "tenantId", "name", "jobType", "jobVersion", "payload", "cron", "timeZone", "status", "pausedReason", "ownerSubjectId", "nextRunAt", "lastRunAt", "lastJobId", "createdAt", "updatedAt"';

export class PostgresScheduleStore {
  constructor(
    private readonly pool: Pool,
    private readonly workerPool: Pool = pool,
  ) {}

  async create(command: Required<CreateScheduleCommand> & { readonly id: string; readonly nextRunAt: Date; readonly payload: JsonValue }): Promise<ScheduleRecord> {
    return this.tenantTransaction(command.tenantId, async (client) => {
      const result = await client.query<ScheduleRow>(
        `INSERT INTO "kernel_job_schedules"
           ("id", "tenantId", "name", "jobType", "jobVersion", "payload", "cron", "timeZone", "ownerSubjectId", "nextRunAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, now())
         RETURNING ${COLUMNS}`,
        [
          command.id,
          command.tenantId,
          command.name,
          command.jobType,
          command.jobVersion,
          JSON.stringify(command.payload),
          command.cron,
          command.timeZone,
          command.ownerSubjectId,
          command.nextRunAt,
        ],
      );
      return toRecord(result.rows[0]!);
    });
  }

  async list(tenantId: string): Promise<ScheduleRecord[]> {
    return this.tenantTransaction(tenantId, async (client) => {
      const result = await client.query<ScheduleRow>(`SELECT ${COLUMNS} FROM "kernel_job_schedules" ORDER BY "name"`);
      return result.rows.map(toRecord);
    });
  }

  async get(tenantId: string, id: string): Promise<ScheduleRecord | null> {
    return this.tenantTransaction(tenantId, async (client) => {
      const result = await client.query<ScheduleRow>(`SELECT ${COLUMNS} FROM "kernel_job_schedules" WHERE "id" = $1`, [id]);
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    });
  }

  /** Pauses (with a reason) or resumes (with the next due time) a tenant's schedule. */
  async setStatus(tenantId: string, id: string, change: { status: 'PAUSED'; reason: string } | { status: 'ACTIVE'; nextRunAt: Date }): Promise<ScheduleRecord | null> {
    return this.tenantTransaction(tenantId, async (client) => {
      const result = await client.query<ScheduleRow>(
        change.status === 'PAUSED'
          ? `UPDATE "kernel_job_schedules" SET "status" = 'PAUSED', "pausedReason" = $2, "updatedAt" = now() WHERE "id" = $1 RETURNING ${COLUMNS}`
          : `UPDATE "kernel_job_schedules" SET "status" = 'ACTIVE', "pausedReason" = NULL, "nextRunAt" = $2, "updatedAt" = now() WHERE "id" = $1 RETURNING ${COLUMNS}`,
        [id, change.status === 'PAUSED' ? change.reason.slice(0, 256) : change.nextRunAt],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    });
  }

  /** Locks up to `limit` due schedules (skipping ones another worker holds) and hands them to `work` in one transaction. */
  async claimDue(now: Date, limit: number, work: (client: PoolClient, due: readonly ScheduleRecord[]) => Promise<void>): Promise<number> {
    const client = await this.workerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE gigalibs_jobs_worker');
      const result = await client.query<ScheduleRow>(
        `SELECT ${COLUMNS} FROM "kernel_job_schedules"
          WHERE "status" = 'ACTIVE' AND "nextRunAt" <= $1
          ORDER BY "nextRunAt" LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [now, limit],
      );
      const due = result.rows.map(toRecord);
      await work(client, due);
      await client.query('COMMIT');
      return due.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async tenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE gigalibs_jobs_tenant');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
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

export interface KernelSchedulerOptions {
  readonly store: PostgresScheduleStore;
  readonly jobs: Pick<KernelJobs, 'enqueue'>;
  readonly registry: JobRegistry;
  readonly resolveOwner: ScheduleOwnerResolver;
  readonly clock?: () => Date;
}

export class KernelScheduler {
  readonly #options: KernelSchedulerOptions;
  readonly #clock: () => Date;

  constructor(options: KernelSchedulerOptions) {
    this.#options = options;
    this.#clock = options.clock ?? (() => new Date());
  }

  /** Validates the cron, time zone, job definition and payload before anything is stored. */
  async create(command: CreateScheduleCommand): Promise<ScheduleRecord> {
    const name = command.name.trim();
    if (name.length < 1 || name.length > 120) throw new JobDefinitionError('A schedule name must be 1 to 120 characters.');
    const timeZone = command.timeZone ?? 'UTC';
    assertTimeZone(timeZone);
    const nextRunAt = nextCronRun(parseCron(command.cron), this.#clock(), timeZone);
    const definition = this.#options.registry.resolve(command.jobType, command.jobVersion);
    definition.parsePayload(command.payload);
    return this.#options.store.create({
      ...command,
      name,
      timeZone,
      id: randomUUID(),
      payload: command.payload as JsonValue,
      nextRunAt,
    });
  }

  async resume(tenantId: string, id: string): Promise<ScheduleRecord | null> {
    const schedule = await this.#options.store.get(tenantId, id);
    if (!schedule) return null;
    const nextRunAt = nextCronRun(parseCron(schedule.cron), this.#clock(), schedule.timeZone);
    return this.#options.store.setStatus(tenantId, id, { status: 'ACTIVE', nextRunAt });
  }

  pause(tenantId: string, id: string, reason: string): Promise<ScheduleRecord | null> {
    return this.#options.store.setStatus(tenantId, id, { status: 'PAUSED', reason });
  }

  /** Turns every due schedule into a job; returns how many schedules were handled. */
  async tick(limit = 50): Promise<number> {
    const now = this.#clock();
    return this.#options.store.claimDue(now, limit, async (client, due) => {
      for (const schedule of due) {
        const pause = (reason: string) =>
          client.query(`UPDATE "kernel_job_schedules" SET "status" = 'PAUSED', "pausedReason" = $2, "updatedAt" = now() WHERE "id" = $1`, [
            schedule.id,
            reason.slice(0, 256),
          ]);
        const owner = await this.#options.resolveOwner(schedule.tenantId, schedule.ownerSubjectId);
        if (!owner) {
          await pause('The schedule owner is no longer an active member of this workspace.');
          continue;
        }
        let jobId: string;
        let nextRunAt: Date;
        try {
          const job = await this.#options.jobs.enqueue({
            tenantId: schedule.tenantId,
            type: schedule.jobType,
            version: schedule.jobVersion,
            payload: schedule.payload,
            ownerSubjectId: schedule.ownerSubjectId,
            ownerAuthVersion: owner.authVersion,
            correlationId: `schedule:${schedule.id}`,
            idempotencyKey: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
            availableAt: now,
          });
          jobId = job.id;
          nextRunAt = nextCronRun(parseCron(schedule.cron), now, schedule.timeZone);
        } catch (error) {
          if (error instanceof JobDefinitionError || error instanceof CronExpressionError) {
            await pause(`The schedule can no longer run: ${error.message}`);
            continue;
          }
          throw error;
        }
        await client.query(
          `UPDATE "kernel_job_schedules" SET "nextRunAt" = $2, "lastRunAt" = $3, "lastJobId" = $4, "updatedAt" = now() WHERE "id" = $1`,
          [schedule.id, nextRunAt, schedule.nextRunAt, jobId],
        );
      }
    });
  }
}

function toRecord(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    jobType: row.jobType,
    jobVersion: row.jobVersion,
    payload: row.payload,
    cron: row.cron,
    timeZone: row.timeZone,
    status: row.status,
    pausedReason: row.pausedReason,
    ownerSubjectId: row.ownerSubjectId,
    nextRunAt: new Date(row.nextRunAt),
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt) : null,
    lastJobId: row.lastJobId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
