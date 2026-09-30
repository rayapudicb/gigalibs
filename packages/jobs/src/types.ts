export const JOB_BACKENDS = ['POSTGRES', 'BULLMQ'] as const;
export type JobBackend = (typeof JOB_BACKENDS)[number];

export const JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'DEAD_LETTER',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobDispatchStatus = 'NOT_REQUIRED' | 'PENDING' | 'DISPATCHED';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JobBackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
}

export interface JobExecutionContext<TPayload> {
  readonly jobId: string;
  readonly tenantId: string;
  readonly ownerSubjectId: string;
  readonly ownerAuthVersion: number;
  readonly correlationId: string;
  readonly attempt: number;
  readonly payload: TPayload;
  readonly signal: AbortSignal;
}

export interface JobDefinition<TPayload = unknown> {
  readonly type: string;
  readonly version: number;
  readonly backend: JobBackend;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly backoff: JobBackoffPolicy;
  readonly parsePayload: (value: unknown) => TPayload;
  readonly handler: (context: JobExecutionContext<TPayload>) => Promise<JsonValue | undefined>;
}

export interface JobRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly jobType: string;
  readonly jobVersion: number;
  readonly backend: JobBackend;
  readonly status: JobStatus;
  readonly payload: JsonValue;
  readonly payloadSha256: string;
  readonly ownerSubjectId: string;
  readonly ownerAuthVersion: number;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly maxAttempts: number;
  readonly attempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly availableAt: Date;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly heartbeatAt: Date | null;
  readonly dispatchStatus: JobDispatchStatus;
  readonly dispatchAttempts: number;
  readonly dispatchedAt: Date | null;
  readonly dispatchLastError: string | null;
  readonly resultSummary: JsonValue | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly auditSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface JobAuditEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly jobId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly fromStatus: JobStatus | null;
  readonly toStatus: JobStatus;
  readonly attempt: number;
  readonly workerId: string | null;
  readonly correlationId: string;
  readonly errorCode: string | null;
  readonly createdAt: Date;
}

export interface EnqueueJobCommand {
  readonly tenantId: string;
  readonly type: string;
  readonly version: number;
  readonly payload: unknown;
  readonly ownerSubjectId: string;
  readonly ownerAuthVersion: number;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly availableAt?: Date;
}

export interface StoredJobInput {
  readonly id: string;
  readonly tenantId: string;
  readonly jobType: string;
  readonly jobVersion: number;
  readonly backend: JobBackend;
  readonly payload: JsonValue;
  readonly payloadSha256: string;
  readonly ownerSubjectId: string;
  readonly ownerAuthVersion: number;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly availableAt: Date;
  readonly createdAt: Date;
}

export interface JobStore {
  enqueue(input: StoredJobInput): Promise<{ readonly job: JobRecord; readonly created: boolean }>;
  claimNext(
    backend: JobBackend,
    workerId: string,
    leaseMs: number,
    now: Date,
  ): Promise<JobRecord | null>;
  claimById(
    jobId: string,
    backend: JobBackend,
    workerId: string,
    leaseMs: number,
    now: Date,
  ): Promise<JobRecord | null>;
  heartbeat(jobId: string, workerId: string, leaseMs: number, now: Date): Promise<boolean>;
  complete(
    jobId: string,
    workerId: string,
    result: JsonValue | null,
    now: Date,
  ): Promise<JobRecord>;
  fail(
    jobId: string,
    workerId: string,
    failure: { readonly code: string; readonly message: string; readonly retryAt: Date | null },
    now: Date,
  ): Promise<JobRecord>;
  cancel(tenantId: string, jobId: string, actorId: string, now: Date): Promise<JobRecord>;
  listPendingDispatch(limit: number, now: Date): Promise<readonly JobRecord[]>;
  markDispatched(jobId: string, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, message: string, now: Date): Promise<void>;
  getForTenant(tenantId: string, jobId: string): Promise<JobRecord | null>;
  listAuditForTenant(tenantId: string, jobId: string): Promise<readonly JobAuditEvent[]>;
}

export interface BullMqDispatchAdapter {
  publish(job: JobRecord): Promise<void>;
  start(processor: (jobId: string) => Promise<void>): void;
  close(): Promise<void>;
}

export interface JobObserver {
  onEnqueued?(job: JobRecord, created: boolean): void;
  onStarted?(job: JobRecord): void;
  onSucceeded?(job: JobRecord, durationMs: number): void;
  onRetryScheduled?(job: JobRecord, durationMs: number): void;
  onDeadLettered?(job: JobRecord, durationMs: number): void;
  onDispatchFailure?(job: JobRecord, errorCode: string): void;
}
