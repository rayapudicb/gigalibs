CREATE TYPE "RetentionHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "RetentionExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "source_events" ADD COLUMN "payloadPurgedAt" TIMESTAMP(3);

CREATE INDEX "source_events_environmentId_payloadPurgedAt_receivedAt_idx"
  ON "source_events"("environmentId", "payloadPurgedAt", "receivedAt");

CREATE TABLE "data_retention_holds" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "status" "RetentionHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "placedById" TEXT NOT NULL,
  "releasedById" TEXT,
  "releaseReason" TEXT,
  "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_retention_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_retention_holds_reason_check" CHECK (char_length("reason") BETWEEN 10 AND 2000),
  CONSTRAINT "data_retention_holds_release_consistency" CHECK (
    ("status" = 'ACTIVE' AND "releasedById" IS NULL AND "releaseReason" IS NULL AND "releasedAt" IS NULL)
    OR
    ("status" = 'RELEASED' AND "releasedById" IS NOT NULL AND "releaseReason" IS NOT NULL AND "releasedAt" IS NOT NULL)
  )
);

CREATE INDEX "data_retention_holds_tenantId_environmentId_status_idx"
  ON "data_retention_holds"("tenantId", "environmentId", "status");
CREATE INDEX "data_retention_holds_tenantId_placedAt_idx"
  ON "data_retention_holds"("tenantId", "placedAt" DESC);

CREATE TABLE "data_retention_executions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "status" "RetentionExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "sourceEventsPurged" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "data_retention_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_retention_executions_count_check" CHECK ("sourceEventsPurged" >= 0),
  CONSTRAINT "data_retention_executions_status_check" CHECK (
    ("status" = 'RUNNING' AND "completedAt" IS NULL)
    OR
    ("status" IN ('SUCCEEDED', 'FAILED') AND "completedAt" IS NOT NULL)
  )
);

CREATE INDEX "data_retention_executions_tenantId_environmentId_startedAt_idx"
  ON "data_retention_executions"("tenantId", "environmentId", "startedAt" DESC);
CREATE INDEX "data_retention_executions_status_startedAt_idx"
  ON "data_retention_executions"("status", "startedAt");

ALTER TABLE "data_retention_holds"
  ADD CONSTRAINT "data_retention_holds_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_retention_holds"
  ADD CONSTRAINT "data_retention_holds_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_retention_executions"
  ADD CONSTRAINT "data_retention_executions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_retention_executions"
  ADD CONSTRAINT "data_retention_executions_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_source_event_evidence_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."eventId" IS DISTINCT FROM OLD."eventId"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
     OR NEW."sourceConnectionId" IS DISTINCT FROM OLD."sourceConnectionId"
     OR NEW."dataContractVersionId" IS DISTINCT FROM OLD."dataContractVersionId"
     OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
     OR NEW."eventVersion" IS DISTINCT FROM OLD."eventVersion"
     OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
     OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
     OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."actorType" IS DISTINCT FROM OLD."actorType"
     OR NEW."actorId" IS DISTINCT FROM OLD."actorId"
     OR NEW."entityRefs" IS DISTINCT FROM OLD."entityRefs"
     OR NEW."classification" IS DISTINCT FROM OLD."classification"
     OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
     OR NEW."payloadKeyVersion" IS DISTINCT FROM OLD."payloadKeyVersion" THEN
    RAISE EXCEPTION 'source event evidence is immutable';
  END IF;

  IF OLD."payloadPurgedAt" IS NOT NULL THEN
    IF NEW."payloadPurgedAt" IS DISTINCT FROM OLD."payloadPurgedAt"
       OR NEW."payloadCiphertext" IS DISTINCT FROM OLD."payloadCiphertext"
       OR NEW."payloadIv" IS DISTINCT FROM OLD."payloadIv"
       OR NEW."payloadAuthTag" IS DISTINCT FROM OLD."payloadAuthTag" THEN
      RAISE EXCEPTION 'purged source event evidence is immutable';
    END IF;
  ELSIF NEW."payloadPurgedAt" IS NULL THEN
    IF NEW."payloadCiphertext" IS DISTINCT FROM OLD."payloadCiphertext"
       OR NEW."payloadIv" IS DISTINCT FROM OLD."payloadIv"
       OR NEW."payloadAuthTag" IS DISTINCT FROM OLD."payloadAuthTag" THEN
      RAISE EXCEPTION 'source event encrypted payload is immutable before retention purge';
    END IF;
  ELSIF octet_length(NEW."payloadCiphertext") <> 0
     OR octet_length(NEW."payloadIv") <> 0
     OR octet_length(NEW."payloadAuthTag") <> 0 THEN
    RAISE EXCEPTION 'retention purge must erase all encrypted payload bytes';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
