ALTER TYPE "ConnectionInterface" ADD VALUE IF NOT EXISTS 'FILE_UPLOAD';
ALTER TYPE "CredentialAuthType" ADD VALUE IF NOT EXISTS 'HMAC_SHA256';
ALTER TYPE "CredentialAuthType" ADD VALUE IF NOT EXISTS 'USERNAME_PASSWORD';

CREATE TYPE "SourceFileStatus" AS ENUM (
  'UPLOAD_PENDING',
  'AVAILABLE',
  'PROFILED',
  'INGESTED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "source_file_imports" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "declaredByteSize" INTEGER NOT NULL,
  "actualByteSize" INTEGER,
  "checksumSha256" TEXT NOT NULL,
  "classification" "DataClassification",
  "status" "SourceFileStatus" NOT NULL DEFAULT 'UPLOAD_PENDING',
  "failureCode" TEXT,
  "createdById" TEXT NOT NULL,
  "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "storageDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_file_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "source_file_imports_declared_size_check" CHECK ("declaredByteSize" > 0),
  CONSTRAINT "source_file_imports_actual_size_check" CHECK ("actualByteSize" IS NULL OR "actualByteSize" > 0),
  CONSTRAINT "source_file_imports_checksum_check" CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "source_file_imports_sourceEventId_key"
  ON "source_file_imports"("sourceEventId");
CREATE UNIQUE INDEX "source_file_imports_storageKey_key"
  ON "source_file_imports"("storageKey");
CREATE INDEX "source_file_imports_tenantId_environmentId_status_createdAt_idx"
  ON "source_file_imports"("tenantId", "environmentId", "status", "createdAt" DESC);
CREATE INDEX "source_file_imports_tenantId_connectionId_createdAt_idx"
  ON "source_file_imports"("tenantId", "connectionId", "createdAt" DESC);

ALTER TABLE "source_file_imports"
  ADD CONSTRAINT "source_file_imports_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_file_imports"
  ADD CONSTRAINT "source_file_imports_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_file_imports"
  ADD CONSTRAINT "source_file_imports_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_file_imports"
  ADD CONSTRAINT "source_file_imports_sourceEventId_fkey"
  FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_source_file_identity_immutability()
RETURNS trigger AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
    OR NEW."connectionId" IS DISTINCT FROM OLD."connectionId"
    OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
    OR NEW."originalName" IS DISTINCT FROM OLD."originalName"
    OR NEW."contentType" IS DISTINCT FROM OLD."contentType"
    OR NEW."declaredByteSize" IS DISTINCT FROM OLD."declaredByteSize"
    OR NEW."checksumSha256" IS DISTINCT FROM OLD."checksumSha256"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."uploadExpiresAt" IS DISTINCT FROM OLD."uploadExpiresAt"
    OR (OLD."classification" IS NOT NULL AND NEW."classification" IS DISTINCT FROM OLD."classification")
    OR (OLD."sourceEventId" IS NOT NULL AND NEW."sourceEventId" IS DISTINCT FROM OLD."sourceEventId")
  THEN
    RAISE EXCEPTION 'source file identity and classification are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "source_file_import_identity_immutable"
BEFORE UPDATE ON "source_file_imports"
FOR EACH ROW EXECUTE FUNCTION enforce_source_file_identity_immutability();
