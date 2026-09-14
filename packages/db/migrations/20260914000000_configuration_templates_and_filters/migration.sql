BEGIN;

-- Template catalog: named default-value sets for a given entity surface.
-- Templates are authored by tenant admins and used as starting points for new records.
CREATE TABLE "configuration_templates" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entityKey" text NOT NULL,
  "name" text NOT NULL CHECK (char_length("name") BETWEEN 1 AND 160),
  "description" text CHECK ("description" IS NULL OR char_length("description") <= 1000),
  "publishedVersionId" text NOT NULL REFERENCES "configuration_published_versions"("id") ON DELETE RESTRICT,
  "manifestChecksum" text NOT NULL CHECK ("manifestChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "values" jsonb NOT NULL,
  "valuesChecksum" text NOT NULL CHECK ("valuesChecksum" ~ '^sha256:[0-9a-f]{64}$'),
  "sourceTemplateId" text REFERENCES "configuration_templates"("id") ON DELETE SET NULL,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updatedById" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamptz(3)
);

CREATE INDEX "configuration_templates_tenant_entity_idx"
  ON "configuration_templates"("tenantId", "entityKey", "deletedAt", "updatedAt" DESC);
CREATE INDEX "configuration_templates_tenant_published_idx"
  ON "configuration_templates"("tenantId", "publishedVersionId");

-- Saved filter presets: named query snapshots (search/filter/sort) per entity surface.
-- Personal to the creator but visible to all tenant admins by design.
CREATE TABLE "configuration_saved_filters" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entityKey" text NOT NULL,
  "name" text NOT NULL CHECK (char_length("name") BETWEEN 1 AND 120),
  "filterKey" text,
  "filterValue" text,
  "search" text CHECK ("search" IS NULL OR char_length("search") <= 200),
  "sortKey" text CHECK ("sortKey" IS NULL OR "sortKey" IN ('updated-at','created-at')),
  "sortDirection" text NOT NULL DEFAULT 'DESC' CHECK ("sortDirection" IN ('ASC','DESC')),
  "createdById" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "configuration_saved_filters_tenant_entity_idx"
  ON "configuration_saved_filters"("tenantId", "entityKey", "createdAt" DESC);
CREATE INDEX "configuration_saved_filters_creator_idx"
  ON "configuration_saved_filters"("createdById");

COMMIT;
