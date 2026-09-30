import { describe, expect, it, vi } from 'vitest';
import { exponentialBackoffMs } from './backoff.js';
import { JobDefinitionError, NonRetryableJobError } from './errors.js';
import { KernelJobs } from './kernel-jobs.js';
import { JobRegistry } from './registry.js';
import type {
  BullMqDispatchAdapter,
  JobDefinition,
  JobRecord,
  JobStore,
  StoredJobInput,
} from './types.js';
import { MAX_JOB_PAYLOAD_BYTES, canonicalJson } from './validation.js';

const NOW = new Date('2026-09-30T10:00:00.000Z');

describe('JobRegistry and validation', () => {
  it('registers a versioned definition once and rejects an invalid duplicate', () => {
    const registry = new JobRegistry();
    const definition = makeDefinition();
    registry.register(definition);

    expect(registry.resolve('analytics.summary-build', 1)).toBeTruthy();
    expect(() => registry.register(definition)).toThrow(/already registered/);
    expect(() => registry.resolve('analytics.summary-build', 2)).toThrow(/not registered/);
  });

  it('canonicalizes JSON and rejects values that are not safe durable JSON', () => {
    const first = canonicalJson({ z: 1, nested: { b: true, a: 'x' } }, MAX_JOB_PAYLOAD_BYTES);
    const second = canonicalJson({ nested: { a: 'x', b: true }, z: 1 }, MAX_JOB_PAYLOAD_BYTES);

    expect(first.json).toBe(second.json);
    expect(first.sha256).toBe(second.sha256);
    expect(() => canonicalJson({ when: new Date() }, MAX_JOB_PAYLOAD_BYTES)).toThrow(
      /plain objects/,
    );
    expect(() => canonicalJson({ broken: undefined }, MAX_JOB_PAYLOAD_BYTES)).toThrow(/undefined/);
    expect(() =>
      canonicalJson({ tooLarge: 'x'.repeat(MAX_JOB_PAYLOAD_BYTES) }, MAX_JOB_PAYLOAD_BYTES),
    ).toThrow(/byte limit/);
  });

  it('bounds exponential retry backoff', () => {
    expect(exponentialBackoffMs(1, 100, 1_000)).toBe(100);
    expect(exponentialBackoffMs(5, 100, 1_000)).toBe(1_000);
  });
});

describe('KernelJobs', () => {
  it('persists canonical tenant and authority metadata and schedules only in the future', async () => {
    const registry = registryWith(makeDefinition());
    let storedInput: StoredJobInput | undefined;
    const store = stubStore({
      enqueue: async (input) => {
        storedInput = input;
        return {
          job: makeJob({ payload: input.payload, payloadSha256: input.payloadSha256 }),
          created: true,
        };
      },
    });
    const jobs = new KernelJobs({
      store,
      registry,
      clock: () => NOW,
      idFactory: () => 'job-fixed',
    });

    await jobs.enqueue(command({ payload: { sourceId: 'source-z' } }));

    expect(storedInput).toMatchObject({
      id: 'job-fixed',
      tenantId: 'tenant-a',
      ownerSubjectId: 'user-a',
      ownerAuthVersion: 7,
      correlationId: 'correlation-a',
      idempotencyKey: 'request-a',
      payload: { sourceId: 'source-z' },
    });
    await expect(jobs.schedule(command(), NOW)).rejects.toThrow(/future runAt/);
    await expect(jobs.schedule(command(), new Date(NOW.getTime() + 1_000))).resolves.toBeTruthy();
  });

  it('executes a PostgreSQL job with its tenant-bound owner context', async () => {
    let executionContext: unknown;
    const definition = makeDefinition(async (context) => {
      executionContext = context;
      return { rows: 4 };
    });
    const running = makeJob({ status: 'RUNNING', attempts: 1, leaseOwner: 'worker-a' });
    const succeeded = makeJob({
      status: 'SUCCEEDED',
      attempts: 1,
      completedAt: NOW,
      resultSummary: { rows: 4 },
    });
    const complete = vi.fn(async () => succeeded);
    const store = stubStore({ claimNext: async () => running, complete });
    const jobs = new KernelJobs({ store, registry: registryWith(definition), clock: () => NOW });

    await expect(jobs.runNextPostgres('worker-a')).resolves.toBe(succeeded);
    expect(executionContext).toMatchObject({
      jobId: 'job-a',
      tenantId: 'tenant-a',
      ownerSubjectId: 'user-a',
      ownerAuthVersion: 7,
      correlationId: 'correlation-a',
      attempt: 1,
    });
    expect(complete).toHaveBeenCalledWith('job-a', 'worker-a', { rows: 4 }, NOW);
  });

  it('schedules retryable failures and dead-letters explicit non-retryable failures', async () => {
    const running = makeJob({ status: 'RUNNING', attempts: 1, leaseOwner: 'worker-a' });
    const retry = makeJob({
      status: 'RETRY_WAIT',
      attempts: 1,
      availableAt: new Date(NOW.getTime() + 100),
    });
    const retryFail = vi.fn<JobStore['fail']>(async () => retry);
    const retryJobs = new KernelJobs({
      store: stubStore({ claimNext: async () => running, fail: retryFail }),
      registry: registryWith(
        makeDefinition(async () => Promise.reject(new Error('provider unavailable'))),
      ),
      clock: () => NOW,
    });

    await expect(retryJobs.runNextPostgres('worker-a')).resolves.toBe(retry);
    expect(retryFail.mock.calls[0]?.[2]).toMatchObject({
      code: 'JOB_EXECUTION_FAILED',
      message: 'provider unavailable',
      retryAt: new Date(NOW.getTime() + 100),
    });

    const dead = makeJob({ status: 'DEAD_LETTER', attempts: 1, completedAt: NOW });
    const deadFail = vi.fn<JobStore['fail']>(async () => dead);
    const deadJobs = new KernelJobs({
      store: stubStore({ claimNext: async () => running, fail: deadFail }),
      registry: registryWith(
        makeDefinition(async () =>
          Promise.reject(new NonRetryableJobError('INVALID_SOURCE', 'source removed')),
        ),
      ),
      clock: () => NOW,
    });

    await expect(deadJobs.runNextPostgres('worker-a')).resolves.toBe(dead);
    expect(deadFail.mock.calls[0]?.[2]).toMatchObject({
      code: 'INVALID_SOURCE',
      message: 'source removed',
      retryAt: null,
    });
  });

  it('durably records a BullMQ dispatch failure instead of losing the accepted job', async () => {
    const queued = makeJob({ backend: 'BULLMQ', dispatchStatus: 'PENDING' });
    const markDispatchFailed = vi.fn(async () => undefined);
    const bullMq: BullMqDispatchAdapter = {
      publish: async () => Promise.reject(new Error('redis unavailable')),
      start: () => undefined,
      close: async () => undefined,
    };
    const jobs = new KernelJobs({
      store: stubStore({
        enqueue: async () => ({ job: queued, created: true }),
        markDispatchFailed,
      }),
      registry: registryWith(makeDefinition(undefined, 'BULLMQ')),
      bullMq,
      clock: () => NOW,
    });

    await expect(jobs.enqueue(command())).resolves.toBe(queued);
    expect(markDispatchFailed).toHaveBeenCalledWith('job-a', 'redis unavailable', NOW);
  });

  it('classifies a bounded execution timeout and signals cancellation to the handler', async () => {
    let aborted = false;
    const running = makeJob({
      status: 'RUNNING',
      attempts: 1,
      maxAttempts: 1,
      leaseOwner: 'worker-a',
    });
    const dead = makeJob({ status: 'DEAD_LETTER', attempts: 1, maxAttempts: 1, completedAt: NOW });
    const fail = vi.fn<JobStore['fail']>(async () => dead);
    const definition = {
      ...makeDefinition(
        async ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      ),
      timeoutMs: 100,
    };
    const jobs = new KernelJobs({
      store: stubStore({ claimNext: async () => running, fail }),
      registry: registryWith(definition),
      clock: () => NOW,
    });

    await expect(jobs.runNextPostgres('worker-a')).resolves.toBe(dead);
    expect(aborted).toBe(true);
    expect(fail.mock.calls[0]?.[2]).toMatchObject({ code: 'JOB_TIMEOUT', retryAt: null });
  });
});

function registryWith(definition: JobDefinition<{ readonly sourceId: string }>): JobRegistry {
  const registry = new JobRegistry();
  registry.register(definition);
  return registry;
}

function makeDefinition(
  handler: JobDefinition<{ readonly sourceId: string }>['handler'] = async () => ({
    accepted: true,
  }),
  backend: JobDefinition['backend'] = 'POSTGRES',
): JobDefinition<{ readonly sourceId: string }> {
  return {
    type: 'analytics.summary-build',
    version: 1,
    backend,
    maxAttempts: 3,
    timeoutMs: 1_000,
    backoff: { baseMs: 100, maxMs: 1_000 },
    parsePayload(value) {
      if (
        typeof value !== 'object' ||
        value === null ||
        typeof (value as { sourceId?: unknown }).sourceId !== 'string'
      ) {
        throw new JobDefinitionError('sourceId is required.');
      }
      return { sourceId: (value as { sourceId: string }).sourceId };
    },
    handler,
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-a',
    type: 'analytics.summary-build',
    version: 1,
    payload: { sourceId: 'source-a' },
    ownerSubjectId: 'user-a',
    ownerAuthVersion: 7,
    correlationId: 'correlation-a',
    idempotencyKey: 'request-a',
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-a',
    tenantId: 'tenant-a',
    jobType: 'analytics.summary-build',
    jobVersion: 1,
    backend: 'POSTGRES',
    status: 'QUEUED',
    payload: { sourceId: 'source-a' },
    payloadSha256: 'a'.repeat(64),
    ownerSubjectId: 'user-a',
    ownerAuthVersion: 7,
    correlationId: 'correlation-a',
    idempotencyKey: 'request-a',
    maxAttempts: 3,
    attempts: 0,
    backoffBaseMs: 100,
    backoffMaxMs: 1_000,
    availableAt: NOW,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    dispatchStatus: 'NOT_REQUIRED',
    dispatchAttempts: 0,
    dispatchedAt: null,
    dispatchLastError: null,
    resultSummary: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    auditSequence: 1,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function stubStore(overrides: Partial<JobStore> = {}): JobStore {
  const unavailable = async (): Promise<never> =>
    Promise.reject(new Error('Unexpected store call.'));
  return {
    enqueue: unavailable,
    claimNext: async () => null,
    claimById: async () => null,
    heartbeat: async () => false,
    complete: unavailable,
    fail: unavailable,
    cancel: unavailable,
    listPendingDispatch: async () => [],
    markDispatched: async () => undefined,
    markDispatchFailed: async () => undefined,
    getForTenant: async () => null,
    listAuditForTenant: async () => [],
    ...overrides,
  };
}
