-- WI-OI-104b — one durable kernel job lifecycle for PostgreSQL and BullMQ backends.
-- PostgreSQL remains the source of truth; Redis/BullMQ is an optional transient dispatcher.

CREATE TYPE "KernelJobBackend" AS ENUM ('POSTGRES', 'BULLMQ');
CREATE TYPE "KernelJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'DEAD_LETTER',
  'CANCELLED'
);
CREATE TYPE "KernelJobDispatchStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'DISPATCHED');

CREATE TABLE "kernel_job_runs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "jobType" VARCHAR(128) NOT NULL,
  "jobVersion" INTEGER NOT NULL,
  "backend" "KernelJobBackend" NOT NULL,
  "status" "KernelJobStatus" NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "ownerSubjectId" VARCHAR(128) NOT NULL,
  "ownerAuthVersion" INTEGER NOT NULL,
  "correlationId" VARCHAR(128) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "maxAttempts" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "backoffBaseMs" INTEGER NOT NULL,
  "backoffMaxMs" INTEGER NOT NULL,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" VARCHAR(128),
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "heartbeatAt" TIMESTAMPTZ(3),
  "dispatchStatus" "KernelJobDispatchStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
  "dispatchedAt" TIMESTAMPTZ(3),
  "dispatchLastError" VARCHAR(2048),
  "resultSummary" JSONB,
  "lastErrorCode" VARCHAR(128),
  "lastErrorMessage" VARCHAR(2048),
  "auditSequence" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "kernel_job_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kernel_job_runs_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kernel_job_runs_tenant_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "kernel_job_runs_idempotency_key" UNIQUE ("tenantId", "jobType", "idempotencyKey"),
  CONSTRAINT "kernel_job_runs_type_check" CHECK ("jobType" ~ '^[a-z][a-z0-9.-]{2,127}$'),
  CONSTRAINT "kernel_job_runs_version_check" CHECK ("jobVersion" BETWEEN 1 AND 2147483647),
  CONSTRAINT "kernel_job_runs_owner_auth_check" CHECK ("ownerAuthVersion" >= 0),
  CONSTRAINT "kernel_job_runs_attempts_check" CHECK (
    "maxAttempts" BETWEEN 1 AND 25 AND "attempts" BETWEEN 0 AND "maxAttempts"
  ),
  CONSTRAINT "kernel_job_runs_backoff_check" CHECK (
    "backoffBaseMs" BETWEEN 100 AND 3600000
    AND "backoffMaxMs" BETWEEN "backoffBaseMs" AND 86400000
  ),
  CONSTRAINT "kernel_job_runs_payload_size_check" CHECK (octet_length("payload"::text) <= 262144),
  CONSTRAINT "kernel_job_runs_result_size_check" CHECK (
    "resultSummary" IS NULL OR octet_length("resultSummary"::text) <= 65536
  ),
  CONSTRAINT "kernel_job_runs_hash_check" CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "kernel_job_runs_dispatch_shape_check" CHECK (
    ("backend" = 'POSTGRES' AND "dispatchStatus" = 'NOT_REQUIRED')
    OR ("backend" = 'BULLMQ' AND "dispatchStatus" IN ('PENDING', 'DISPATCHED'))
  ),
  CONSTRAINT "kernel_job_runs_lease_shape_check" CHECK (
    ("status" = 'RUNNING' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "heartbeatAt" IS NOT NULL)
    OR ("status" <> 'RUNNING' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "kernel_job_runs_terminal_shape_check" CHECK (
    ("status" IN ('SUCCEEDED', 'DEAD_LETTER', 'CANCELLED') AND "completedAt" IS NOT NULL)
    OR ("status" NOT IN ('SUCCEEDED', 'DEAD_LETTER', 'CANCELLED') AND "completedAt" IS NULL)
  )
);

CREATE INDEX "kernel_job_runs_ready_idx"
  ON "kernel_job_runs"("backend", "status", "availableAt", "createdAt");
CREATE INDEX "kernel_job_runs_dispatch_idx"
  ON "kernel_job_runs"("backend", "dispatchStatus", "availableAt");
CREATE INDEX "kernel_job_runs_lease_idx"
  ON "kernel_job_runs"("status", "leaseExpiresAt")
  WHERE "status" = 'RUNNING';
CREATE INDEX "kernel_job_runs_tenant_created_idx"
  ON "kernel_job_runs"("tenantId", "createdAt" DESC);

CREATE TABLE "kernel_job_audit_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "fromStatus" "KernelJobStatus",
  "toStatus" "KernelJobStatus" NOT NULL,
  "attempt" INTEGER NOT NULL,
  "workerId" VARCHAR(128),
  "correlationId" VARCHAR(128) NOT NULL,
  "errorCode" VARCHAR(128),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kernel_job_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kernel_job_audit_events_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kernel_job_audit_events_job_fkey" FOREIGN KEY ("tenantId", "jobId")
    REFERENCES "kernel_job_runs"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kernel_job_audit_events_sequence_key" UNIQUE ("tenantId", "jobId", "sequence"),
  CONSTRAINT "kernel_job_audit_events_attempt_check" CHECK ("attempt" >= 0)
);

CREATE INDEX "kernel_job_audit_events_tenant_created_idx"
  ON "kernel_job_audit_events"("tenantId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_jobs_tenant') THEN
    CREATE ROLE gigalibs_jobs_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_jobs_worker') THEN
    CREATE ROLE gigalibs_jobs_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- The migration principal can run local certification. Runtime principals still require an explicit
-- environment-specific GRANT before starting a worker; the role remains NOLOGIN and NOBYPASSRLS.
GRANT gigalibs_jobs_tenant, gigalibs_jobs_worker TO CURRENT_USER;

ALTER TABLE "kernel_job_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kernel_job_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "kernel_job_runs_tenant_policy" ON "kernel_job_runs"
  TO gigalibs_jobs_tenant
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
CREATE POLICY "kernel_job_runs_worker_policy" ON "kernel_job_runs"
  TO gigalibs_jobs_worker USING (true) WITH CHECK (true);

ALTER TABLE "kernel_job_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kernel_job_audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "kernel_job_audit_events_tenant_policy" ON "kernel_job_audit_events"
  TO gigalibs_jobs_tenant
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
CREATE POLICY "kernel_job_audit_events_worker_policy" ON "kernel_job_audit_events"
  TO gigalibs_jobs_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE "kernel_job_runs" TO gigalibs_jobs_tenant, gigalibs_jobs_worker;
GRANT SELECT, INSERT ON TABLE "kernel_job_audit_events" TO gigalibs_jobs_tenant, gigalibs_jobs_worker;

COMMENT ON TABLE "kernel_job_runs" IS
  'WI-OI-104b durable kernel job truth. Payloads must contain references, never plaintext credentials.';
COMMENT ON TABLE "kernel_job_audit_events" IS
  'Append-only lifecycle evidence written in the same transaction as each kernel job state change.';
