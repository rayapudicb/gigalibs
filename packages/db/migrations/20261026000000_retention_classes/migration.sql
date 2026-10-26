-- WI-OI-120 (T9b): named, tenant-defined retention classes. An environment adopts a class and the purge uses its
-- period; a legal hold still overrides any class. Additive — environments created before this keep their bare
-- `retentionDays` (retentionClassId stays NULL).

CREATE TYPE "RetentionBasis" AS ENUM ('REGULATORY', 'LEGAL', 'CONTRACTUAL', 'OPERATIONAL');

CREATE TABLE "retention_classes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "retentionDays" INTEGER NOT NULL,
  "basis" "RetentionBasis" NOT NULL DEFAULT 'OPERATIONAL',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "retention_classes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retention_classes_key_check" CHECK ("key" ~ '^[a-z][a-z0-9-]{1,62}$'),
  CONSTRAINT "retention_classes_name_check" CHECK (char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "retention_classes_days_check" CHECK ("retentionDays" BETWEEN 1 AND 36500)
);

-- The stable slug is unique per tenant.
CREATE UNIQUE INDEX "retention_classes_tenantId_key_key" ON "retention_classes"("tenantId", "key");
-- At most one live default class per tenant (archived ones are ignored).
CREATE UNIQUE INDEX "retention_classes_one_default_per_tenant"
  ON "retention_classes"("tenantId") WHERE "isDefault" AND "archivedAt" IS NULL;
CREATE INDEX "retention_classes_tenantId_archivedAt_idx"
  ON "retention_classes"("tenantId", "archivedAt");

ALTER TABLE "retention_classes"
  ADD CONSTRAINT "retention_classes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_environments" ADD COLUMN "retentionClassId" TEXT;
ALTER TABLE "tenant_environments"
  ADD CONSTRAINT "tenant_environments_retentionClassId_fkey"
  FOREIGN KEY ("retentionClassId") REFERENCES "retention_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
