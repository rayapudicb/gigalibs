-- Baseline the workflow runtime tables that predated Prisma migration tracking.
-- Existing installations must mark this migration applied after verifying these
-- objects; new installations execute it normally.

CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'QUARANTINED');
CREATE TYPE "IngestionCadence" AS ENUM ('REALTIME_CDC', 'SYNC_8_HOURS', 'SYNC_24_HOURS');

CREATE TABLE "workflow_pipelines" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "targetApp" TEXT NOT NULL,
  "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
  "definition" JSONB NOT NULL,
  "totalRuns" INTEGER NOT NULL DEFAULT 0,
  "successRate" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_pipelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_runs" (
  "id" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "creditsSettled" INTEGER NOT NULL DEFAULT 0,
  "executionLog" JSONB,
  "errorDetails" TEXT,
  "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingestion_streams" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "targetDestination" TEXT NOT NULL,
  "cadence" "IngestionCadence" NOT NULL DEFAULT 'SYNC_8_HOURS',
  "topology" TEXT NOT NULL DEFAULT 'FAN_IN',
  "lastRunRows" INTEGER NOT NULL DEFAULT 0,
  "p99LatencyMs" INTEGER NOT NULL DEFAULT 25,
  "dataDriftPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingestion_streams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_pipelines_tenantId_idx" ON "workflow_pipelines"("tenantId");
CREATE INDEX "workflow_runs_pipelineId_idx" ON "workflow_runs"("pipelineId");
CREATE INDEX "workflow_runs_tenantId_idx" ON "workflow_runs"("tenantId");
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs"("status");
CREATE INDEX "ingestion_streams_tenantId_idx" ON "ingestion_streams"("tenantId");

ALTER TABLE "workflow_pipelines" ADD CONSTRAINT "workflow_pipelines_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "workflow_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingestion_streams" ADD CONSTRAINT "ingestion_streams_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
