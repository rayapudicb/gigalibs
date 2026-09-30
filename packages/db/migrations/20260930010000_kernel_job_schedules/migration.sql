-- WI-OI-104c: recurring kernel job schedules. A schedule turns into one kernel job per due time (idempotency key
-- schedule:<id>:<due time>), owned by the schedule owner whose rights are re-checked when the job runs. A worker that
-- was down runs a missed schedule once, not once per missed time.

CREATE TYPE "KernelJobScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "kernel_job_schedules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "jobType" VARCHAR(128) NOT NULL,
  "jobVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "cron" VARCHAR(120) NOT NULL,
  "timeZone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "status" "KernelJobScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
  "pausedReason" VARCHAR(256),
  "ownerSubjectId" VARCHAR(128) NOT NULL,
  "nextRunAt" TIMESTAMPTZ(3) NOT NULL,
  "lastRunAt" TIMESTAMPTZ(3),
  "lastJobId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kernel_job_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kernel_job_schedules_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kernel_job_schedules_tenant_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "kernel_job_schedules_name_key" UNIQUE ("tenantId", "name"),
  CONSTRAINT "kernel_job_schedules_type_check" CHECK ("jobType" ~ '^[a-z][a-z0-9.-]{2,127}$'),
  CONSTRAINT "kernel_job_schedules_version_check" CHECK ("jobVersion" BETWEEN 1 AND 2147483647),
  CONSTRAINT "kernel_job_schedules_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "kernel_job_schedules_paused_check" CHECK (("status" = 'PAUSED') = ("pausedReason" IS NOT NULL))
);

CREATE INDEX "kernel_job_schedules_due_idx" ON "kernel_job_schedules" ("nextRunAt") WHERE "status" = 'ACTIVE';

ALTER TABLE "kernel_job_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kernel_job_schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "kernel_job_schedules_tenant_policy" ON "kernel_job_schedules"
  TO gigalibs_jobs_tenant
  USING ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
CREATE POLICY "kernel_job_schedules_worker_policy" ON "kernel_job_schedules"
  TO gigalibs_jobs_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE "kernel_job_schedules" TO gigalibs_jobs_tenant, gigalibs_jobs_worker;
-- A member removes a schedule; its jobs and their audit stay. The worker never deletes.
GRANT DELETE ON TABLE "kernel_job_schedules" TO gigalibs_jobs_tenant;

COMMENT ON TABLE "kernel_job_schedules" IS
  'WI-OI-104c recurring kernel job schedules. Payloads hold references, never credentials.';
