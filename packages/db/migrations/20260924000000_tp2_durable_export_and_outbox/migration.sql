-- TP-2 Durable Tenant Export Job & Platform Outbox Conformance

-- 1. Extend TenantDataExportStatus enum with CANCELLED
ALTER TYPE "TenantDataExportStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. Add columns to tenant_data_exports
ALTER TABLE "tenant_data_exports"
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "dataClassification" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  ADD COLUMN IF NOT EXISTS "scanStatus" TEXT NOT NULL DEFAULT 'UNSCANNED',
  ADD COLUMN IF NOT EXISTS "configurationManifestVersionId" TEXT;

-- 3. Replace terminal shape check constraint to allow CANCELLED state
ALTER TABLE "tenant_data_exports"
  DROP CONSTRAINT IF EXISTS "tenant_data_exports_terminal_shape";

ALTER TABLE "tenant_data_exports"
  ADD CONSTRAINT "tenant_data_exports_terminal_shape" CHECK (
    (
      "status" = 'REQUESTED'
      AND "claimedAt" IS NULL
      AND "snapshotStartedAt" IS NULL
      AND "completedAt" IS NULL
      AND "expiresAt" IS NULL
      AND "archiveDeletedAt" IS NULL
      AND "storageKey" IS NULL
      AND "archiveSha256" IS NULL
      AND "archiveBytes" IS NULL
      AND "manifest" IS NULL
      AND "manifestSha256" IS NULL
      AND "signatureAlgorithm" IS NULL
      AND "signatureKeyId" IS NULL
      AND "signaturePublicKey" IS NULL
      AND "signatureValue" IS NULL
      AND "totalRecords" IS NULL
      AND "failureCode" IS NULL
      AND "failureMessage" IS NULL
    ) OR (
      "status" = 'RUNNING'
      AND "claimedAt" IS NOT NULL
      AND "snapshotStartedAt" IS NOT NULL
      AND "completedAt" IS NULL
      AND "expiresAt" IS NULL
      AND "archiveDeletedAt" IS NULL
      AND "storageKey" IS NULL
      AND "archiveSha256" IS NULL
      AND "archiveBytes" IS NULL
      AND "manifest" IS NULL
      AND "manifestSha256" IS NULL
      AND "signatureAlgorithm" IS NULL
      AND "signatureKeyId" IS NULL
      AND "signaturePublicKey" IS NULL
      AND "signatureValue" IS NULL
      AND "totalRecords" IS NULL
      AND "failureCode" IS NULL
      AND "failureMessage" IS NULL
    ) OR (
      "status" IN ('SUCCEEDED', 'EXPIRED')
      AND "completedAt" IS NOT NULL
      AND "expiresAt" IS NOT NULL
      AND "storageKey" IS NOT NULL
      AND "archiveSha256" IS NOT NULL
      AND "archiveBytes" IS NOT NULL
      AND "manifest" IS NOT NULL
      AND "manifestSha256" IS NOT NULL
      AND "signatureAlgorithm" = 'Ed25519'
      AND "signatureKeyId" IS NOT NULL
      AND "signaturePublicKey" IS NOT NULL
      AND "signatureValue" IS NOT NULL
      AND "totalRecords" IS NOT NULL
      AND "failureCode" IS NULL
      AND (
        ("status" = 'SUCCEEDED' AND "archiveDeletedAt" IS NULL)
        OR ("status" = 'EXPIRED' AND "archiveDeletedAt" IS NOT NULL)
      )
    ) OR (
      "status" = 'FAILED'
      AND "completedAt" IS NOT NULL
      AND "expiresAt" IS NULL
      AND "archiveDeletedAt" IS NULL
      AND "failureCode" IS NOT NULL
      AND "storageKey" IS NULL
      AND "archiveSha256" IS NULL
      AND "archiveBytes" IS NULL
      AND "manifest" IS NULL
      AND "manifestSha256" IS NULL
      AND "signatureAlgorithm" IS NULL
      AND "signatureKeyId" IS NULL
      AND "signaturePublicKey" IS NULL
      AND "signatureValue" IS NULL
      AND "totalRecords" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "completedAt" IS NOT NULL
      AND "expiresAt" IS NULL
      AND "archiveDeletedAt" IS NULL
      AND "storageKey" IS NULL
      AND "archiveSha256" IS NULL
      AND "archiveBytes" IS NULL
      AND "manifest" IS NULL
      AND "manifestSha256" IS NULL
      AND "signatureAlgorithm" IS NULL
      AND "signatureKeyId" IS NULL
      AND "signaturePublicKey" IS NULL
      AND "signatureValue" IS NULL
      AND "totalRecords" IS NULL
    )
  );

-- 4. Unique index for request idempotency per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_exports_tenantId_idempotencyKey_key"
  ON "tenant_data_exports"("tenantId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- 5. Heartbeat index for stale lease recovery
CREATE INDEX IF NOT EXISTS "tenant_data_exports_status_heartbeatAt_idx"
  ON "tenant_data_exports"("status", "heartbeatAt");

-- 6. Create platform_outbox_events table
CREATE TABLE IF NOT EXISTS "platform_outbox_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "aggregateVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_outbox_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "platform_outbox_events_status_availableAt_idx"
  ON "platform_outbox_events"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "platform_outbox_events_tenantId_createdAt_idx"
  ON "platform_outbox_events"("tenantId", "createdAt" DESC);
