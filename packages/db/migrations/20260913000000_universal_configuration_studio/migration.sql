BEGIN;

CREATE TABLE "configuration_change_sets" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "moduleKey" text NOT NULL,
  "entityKey" text NOT NULL,
  "surfaceKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','VALIDATED','SUBMITTED','APPROVED','REJECTED','PUBLISHED','DEPRECATED')),
  "definition" jsonb NOT NULL,
  "compiledManifest" jsonb,
  "checksum" text,
  "findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "compatibility" text CHECK ("compatibility" IS NULL OR "compatibility" IN ('COMPATIBLE','CONDITIONAL','BREAKING')),
  "reason" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "submittedAt" timestamptz(3),
  "approvedById" text REFERENCES "users"("id") ON DELETE RESTRICT,
  "approvedAt" timestamptz(3),
  "rejectedById" text REFERENCES "users"("id") ON DELETE RESTRICT,
  "rejectedAt" timestamptz(3),
  "publishedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "configuration_change_sets_keys" CHECK ("moduleKey" ~ '^[a-z][a-z0-9-]{1,79}$' AND "entityKey" ~ '^[a-z][a-z0-9-]{1,79}$' AND "surfaceKey" ~ '^[a-z][a-z0-9-]{1,79}$')
);

CREATE INDEX "configuration_change_sets_tenant_status_updated_idx" ON "configuration_change_sets"("tenantId", "status", "updatedAt" DESC);
CREATE INDEX "configuration_change_sets_surface_idx" ON "configuration_change_sets"("tenantId", "moduleKey", "entityKey", "surfaceKey");

CREATE TABLE "configuration_published_versions" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "changeSetId" text NOT NULL REFERENCES "configuration_change_sets"("id") ON DELETE RESTRICT,
  "moduleKey" text NOT NULL,
  "entityKey" text NOT NULL,
  "surfaceKey" text NOT NULL,
  "sequence" integer NOT NULL CHECK ("sequence" > 0),
  "manifest" jsonb NOT NULL,
  "checksum" text NOT NULL CHECK ("checksum" ~ '^sha256:[0-9a-f]{64}$'),
  "compilerVersion" text NOT NULL,
  "publishedById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "publishedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "moduleKey", "entityKey", "surfaceKey", "sequence"),
  UNIQUE ("tenantId", "checksum")
);
CREATE INDEX "configuration_published_versions_tenant_published_idx" ON "configuration_published_versions"("tenantId", "publishedAt" DESC);

CREATE TABLE "configuration_activations" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "publishedVersionId" text NOT NULL REFERENCES "configuration_published_versions"("id") ON DELETE RESTRICT,
  "moduleKey" text NOT NULL,
  "entityKey" text NOT NULL,
  "surfaceKey" text NOT NULL,
  "environmentKey" text NOT NULL,
  "cohortKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','INACTIVE','FAILED')),
  "reason" text NOT NULL,
  "activatedById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "activatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedAt" timestamptz(3)
);
CREATE UNIQUE INDEX "configuration_one_active_surface_idx" ON "configuration_activations"("tenantId", "moduleKey", "entityKey", "surfaceKey", "environmentKey", "cohortKey") WHERE "status" = 'ACTIVE';
CREATE INDEX "configuration_activations_scope_idx" ON "configuration_activations"("tenantId", "environmentKey", "cohortKey", "status");

CREATE TABLE "configuration_extension_values" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ownerType" text NOT NULL,
  "ownerId" text NOT NULL,
  "publishedVersionId" text NOT NULL REFERENCES "configuration_published_versions"("id") ON DELETE RESTRICT,
  "manifestChecksum" text NOT NULL CHECK ("manifestChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "values" jsonb NOT NULL,
  "valuesChecksum" text NOT NULL CHECK ("valuesChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updatedById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "ownerType", "ownerId")
);
CREATE INDEX "configuration_extension_values_version_idx" ON "configuration_extension_values"("tenantId", "publishedVersionId");

CREATE TABLE "configuration_idempotency_records" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "operation" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "requestChecksum" text NOT NULL CHECK ("requestChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "response" jsonb NOT NULL,
  "statusCode" integer NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "actorId", "operation", "idempotencyKey")
);
CREATE INDEX "configuration_idempotency_tenant_created_idx" ON "configuration_idempotency_records"("tenantId", "createdAt" DESC);

CREATE TABLE "configuration_records" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entityKey" text NOT NULL,
  "publishedVersionId" text NOT NULL REFERENCES "configuration_published_versions"("id") ON DELETE RESTRICT,
  "manifestChecksum" text NOT NULL CHECK ("manifestChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "values" jsonb NOT NULL,
  "valuesChecksum" text NOT NULL CHECK ("valuesChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updatedById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamptz(3)
);
CREATE INDEX "configuration_records_tenant_entity_deleted_updated_idx" ON "configuration_records"("tenantId", "entityKey", "deletedAt", "updatedAt" DESC);
CREATE INDEX "configuration_records_tenant_published_version_idx" ON "configuration_records"("tenantId", "publishedVersionId");

COMMIT;
