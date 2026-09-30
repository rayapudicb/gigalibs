import { randomUUID } from 'node:crypto';
import { exponentialBackoffMs } from './backoff.js';
import { JobDefinitionError, JobTimeoutError, NonRetryableJobError } from './errors.js';
import type { JobRegistry } from './registry.js';
import type {
  BullMqDispatchAdapter,
  EnqueueJobCommand,
  JobObserver,
  JobRecord,
  JobStore,
  StoredJobInput,
} from './types.js';
import {
  MAX_JOB_PAYLOAD_BYTES,
  MAX_JOB_RESULT_BYTES,
  boundedMessage,
  canonicalJson,
} from './validation.js';

export interface KernelJobsOptions {
  readonly store: JobStore;
  readonly registry: JobRegistry;
  readonly bullMq?: BullMqDispatchAdapter;
  readonly observer?: JobObserver;
  readonly leaseMs?: number;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class KernelJobs {
  readonly #store: JobStore;
  readonly #registry: JobRegistry;
  readonly #bullMq: BullMqDispatchAdapter | undefined;
  readonly #observer: JobObserver;
  readonly #leaseMs: number;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;

  constructor(options: KernelJobsOptions) {
    this.#store = options.store;
    this.#registry = options.registry;
    this.#bullMq = options.bullMq;
    this.#observer = options.observer ?? {};
    this.#leaseMs = options.leaseMs ?? 30_000;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? randomUUID;
    if (
      !Number.isSafeInteger(this.#leaseMs) ||
      this.#leaseMs < 1_000 ||
      this.#leaseMs > 3_600_000
    ) {
      throw new Error('Job leaseMs must be between 1000 and 3600000.');
    }
  }

  async enqueue(command: EnqueueJobCommand): Promise<JobRecord> {
    return this.persist(command, command.availableAt ?? this.#clock());
  }

  async schedule(command: EnqueueJobCommand, runAt: Date): Promise<JobRecord> {
    if (!Number.isFinite(runAt.getTime()) || runAt.getTime() <= this.#clock().getTime()) {
      throw new JobDefinitionError('A scheduled job must have a valid future runAt time.');
    }
    return this.persist(command, runAt);
  }

  async runNextPostgres(workerId: string): Promise<JobRecord | null> {
    const job = await this.#store.claimNext('POSTGRES', workerId, this.#leaseMs, this.#clock());
    return job ? this.execute(job, workerId) : null;
  }

  async runBullMqJob(jobId: string, workerId: string): Promise<JobRecord | null> {
    const job = await this.#store.claimById(
      jobId,
      'BULLMQ',
      workerId,
      this.#leaseMs,
      this.#clock(),
    );
    return job ? this.execute(job, workerId) : null;
  }

  startBullMqWorker(workerId: string): void {
    if (!this.#bullMq) throw new Error('BullMQ is not configured.');
    this.#bullMq.start(async (jobId) => {
      await this.runBullMqJob(jobId, workerId);
    });
  }

  async dispatchPendingBullMq(limit = 50): Promise<number> {
    if (!this.#bullMq) throw new Error('BullMQ is not configured.');
    const jobs = await this.#store.listPendingDispatch(limit, this.#clock());
    let dispatched = 0;
    for (const job of jobs) {
      try {
        await this.#bullMq.publish(job);
        await this.#store.markDispatched(job.id, this.#clock());
        dispatched += 1;
      } catch (error) {
        const code = errorCode(error);
        await this.#store.markDispatchFailed(job.id, boundedMessage(error), this.#clock());
        this.#observer.onDispatchFailure?.(job, code);
      }
    }
    return dispatched;
  }

  async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    return this.#store.heartbeat(jobId, workerId, this.#leaseMs, this.#clock());
  }

  async cancel(tenantId: string, jobId: string, actorId: string): Promise<JobRecord> {
    requireBoundedIdentifier(tenantId, 'tenantId', 128);
    requireBoundedIdentifier(actorId, 'actorId', 128);
    return this.#store.cancel(tenantId, jobId, actorId, this.#clock());
  }

  private async persist(command: EnqueueJobCommand, availableAt: Date): Promise<JobRecord> {
    validateCommand(command);
    const definition = this.#registry.resolve(command.type, command.version);
    const parsed = definition.parsePayload(command.payload);
    const payload = canonicalJson(parsed, MAX_JOB_PAYLOAD_BYTES);
    const now = this.#clock();
    const input: StoredJobInput = {
      id: this.#idFactory(),
      tenantId: command.tenantId,
      jobType: definition.type,
      jobVersion: definition.version,
      backend: definition.backend,
      payload: payload.value,
      payloadSha256: payload.sha256,
      ownerSubjectId: command.ownerSubjectId,
      ownerAuthVersion: command.ownerAuthVersion,
      correlationId: command.correlationId,
      idempotencyKey: command.idempotencyKey,
      maxAttempts: definition.maxAttempts,
      backoffBaseMs: definition.backoff.baseMs,
      backoffMaxMs: definition.backoff.maxMs,
      availableAt,
      createdAt: now,
    };
    const stored = await this.#store.enqueue(input);
    this.#observer.onEnqueued?.(stored.job, stored.created);
    if (
      stored.created &&
      stored.job.backend === 'BULLMQ' &&
      stored.job.availableAt <= now &&
      this.#bullMq
    ) {
      try {
        await this.#bullMq.publish(stored.job);
        await this.#store.markDispatched(stored.job.id, this.#clock());
      } catch (error) {
        const code = errorCode(error);
        await this.#store.markDispatchFailed(stored.job.id, boundedMessage(error), this.#clock());
        this.#observer.onDispatchFailure?.(stored.job, code);
      }
    }
    return stored.job;
  }

  private async execute(job: JobRecord, workerId: string): Promise<JobRecord> {
    const definition = this.#registry.resolve(job.jobType, job.jobVersion);
    if (definition.backend !== job.backend) {
      return this.#store.fail(
        job.id,
        workerId,
        {
          code: 'BACKEND_MISMATCH',
          message: 'The registered job backend does not match its durable record.',
          retryAt: null,
        },
        this.#clock(),
      );
    }

    this.#observer.onStarted?.(job);
    const startedAt = Date.now();
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = definition.parsePayload(job.payload);
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new JobTimeoutError(definition.timeoutMs));
          controller.abort();
        }, definition.timeoutMs);
      });
      const result = await Promise.race([
        definition.handler({
          jobId: job.id,
          tenantId: job.tenantId,
          ownerSubjectId: job.ownerSubjectId,
          ownerAuthVersion: job.ownerAuthVersion,
          correlationId: job.correlationId,
          attempt: job.attempts,
          payload,
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
      const normalized =
        result === undefined ? null : canonicalJson(result, MAX_JOB_RESULT_BYTES).value;
      const completed = await this.#store.complete(job.id, workerId, normalized, this.#clock());
      this.#observer.onSucceeded?.(completed, Date.now() - startedAt);
      return completed;
    } catch (error) {
      const retryable = !(error instanceof NonRetryableJobError);
      const retryAt =
        retryable && job.attempts < job.maxAttempts
          ? new Date(
              this.#clock().getTime() +
                exponentialBackoffMs(job.attempts, job.backoffBaseMs, job.backoffMaxMs),
            )
          : null;
      const failed = await this.#store.fail(
        job.id,
        workerId,
        { code: errorCode(error), message: boundedMessage(error), retryAt },
        this.#clock(),
      );
      if (failed.status === 'RETRY_WAIT') {
        this.#observer.onRetryScheduled?.(failed, Date.now() - startedAt);
      } else {
        this.#observer.onDeadLettered?.(failed, Date.now() - startedAt);
      }
      return failed;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function validateCommand(command: EnqueueJobCommand): void {
  requireBoundedIdentifier(command.tenantId, 'tenantId', 128);
  requireBoundedIdentifier(command.ownerSubjectId, 'ownerSubjectId', 128);
  requireBoundedIdentifier(command.correlationId, 'correlationId', 128);
  requireBoundedIdentifier(command.idempotencyKey, 'idempotencyKey', 200);
  if (!Number.isSafeInteger(command.ownerAuthVersion) || command.ownerAuthVersion < 0) {
    throw new JobDefinitionError('ownerAuthVersion must be a non-negative safe integer.');
  }
}

function requireBoundedIdentifier(value: string, name: string, max: number): void {
  const length = value.trim().length;
  if (length < 1 || length > max)
    throw new JobDefinitionError(`${name} must contain 1–${max} characters.`);
}

function errorCode(error: unknown): string {
  if (error instanceof NonRetryableJobError) return error.code.slice(0, 128);
  if (error instanceof JobTimeoutError) return 'JOB_TIMEOUT';
  return 'JOB_EXECUTION_FAILED';
}
