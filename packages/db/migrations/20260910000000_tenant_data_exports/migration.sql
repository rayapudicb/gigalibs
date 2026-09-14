CREATE TYPE "TenantDataExportStatus" AS ENUM (
  'REQUESTED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "tenant_data_exports" (
  "id" TEXT NOT NULL,
  "status" "TenantDataExportStatus" NOT NULL DEFAULT 'REQUESTED',
  "formatVersion" TEXT NOT NULL DEFAULT 'gigalibs.tenant-portability.v1',
  "requestReason" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ(3),
  "snapshotStartedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3),
  "archiveDeletedAt" TIMESTAMPTZ(3),
  "storageKey" TEXT,
  "archiveSha256" TEXT,
  "archiveBytes" INTEGER,
  "manifest" JSONB,
  "manifestSha256" TEXT,
  "signatureAlgorithm" TEXT,
  "signatureKeyId" TEXT,
  "signaturePublicKey" TEXT,
  "signatureValue" TEXT,
  "totalRecords" INTEGER,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "tenantId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenant_data_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_data_exports_terminal_shape" CHECK (
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
    )
  ),
  CONSTRAINT "tenant_data_exports_reason" CHECK (
    char_length(btrim("requestReason")) BETWEEN 3 AND 500
  ),
  CONSTRAINT "tenant_data_exports_digests" CHECK (
    ("archiveSha256" IS NULL OR "archiveSha256" ~ '^[a-f0-9]{64}$')
    AND ("manifestSha256" IS NULL OR "manifestSha256" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "tenant_data_exports_attempts" CHECK ("attempts" >= 0),
  CONSTRAINT "tenant_data_exports_record_count" CHECK ("totalRecords" IS NULL OR "totalRecords" >= 0),
  CONSTRAINT "tenant_data_exports_archive_bytes" CHECK ("archiveBytes" IS NULL OR "archiveBytes" > 0),
  CONSTRAINT "tenant_data_exports_expiry" CHECK (
    "expiresAt" IS NULL OR "completedAt" IS NULL OR "expiresAt" > "completedAt"
  )
);

CREATE UNIQUE INDEX "tenant_data_exports_storageKey_key"
  ON "tenant_data_exports"("storageKey");
CREATE INDEX "tenant_data_exports_tenantId_status_createdAt_idx"
  ON "tenant_data_exports"("tenantId", "status", "createdAt" DESC);
CREATE INDEX "tenant_data_exports_requestedById_idx"
  ON "tenant_data_exports"("requestedById");
CREATE INDEX "tenant_data_exports_status_availableAt_idx"
  ON "tenant_data_exports"("status", "availableAt");
CREATE UNIQUE INDEX "tenant_data_exports_one_active_per_tenant"
  ON "tenant_data_exports"("tenantId")
  WHERE "status" IN ('REQUESTED', 'RUNNING');

ALTER TABLE "tenant_data_exports"
  ADD CONSTRAINT "tenant_data_exports_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_data_exports"
  ADD CONSTRAINT "tenant_data_exports_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
