-- ============================================================
-- Migration 000006: Schema Discovery + Data Studio Mappings
-- WI-OI-043 Phase 3: Source schema profiling and user-defined mappings
-- ============================================================
-- Forward-only. Never edit. Schema: gigalibs_analytics.

SET search_path TO gigalibs_analytics, public;

-- ── Table: discovered_source_schemas ────────────────────────
-- One row per distinct table discovered in an external source.
-- Populated by schema discovery scan; refreshed on each scan.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.discovered_source_schemas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID        NOT NULL
                      REFERENCES gigalibs_analytics.source_connections (id)
                      ON DELETE CASCADE,
  tenant_id         TEXT        NOT NULL,
  source_table_name TEXT        NOT NULL,
  -- Estimated row count from last scan (may be approximate for large tables)
  estimated_row_count BIGINT,
  -- Timestamp of the sync run that produced this schema snapshot
  discovered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Snapshot is superseded when a newer scan completes
  is_current        BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE (connection_id, source_table_name, is_current)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE gigalibs_analytics.discovered_source_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.discovered_source_schemas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovered_schemas_tenant_isolation ON gigalibs_analytics.discovered_source_schemas;
CREATE POLICY discovered_schemas_tenant_isolation
  ON gigalibs_analytics.discovered_source_schemas
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_discovered_schemas_tenant
  ON gigalibs_analytics.discovered_source_schemas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovered_schemas_connection
  ON gigalibs_analytics.discovered_source_schemas (connection_id, is_current);

-- ── Table: source_field_profiles ────────────────────────────
-- One row per column discovered in a source table.
-- Captures name, inferred type, nullability, and quality metrics
-- sampled from raw_record_versions payloads (never mutates source).
CREATE TABLE IF NOT EXISTS gigalibs_analytics.source_field_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id         UUID        NOT NULL
                      REFERENCES gigalibs_analytics.discovered_source_schemas (id)
                      ON DELETE CASCADE,
  connection_id     UUID        NOT NULL,
  tenant_id         TEXT        NOT NULL,
  field_name        TEXT        NOT NULL,
  -- Inferred JSON type: string | number | boolean | null | object | array
  inferred_type     TEXT        NOT NULL DEFAULT 'string',
  -- Fraction of rows where this field is non-null (0.0–1.0)
  non_null_ratio    NUMERIC(5,4) CHECK (non_null_ratio BETWEEN 0 AND 1),
  -- Count of distinct values in the sample
  distinct_count    BIGINT,
  -- Sample min/max as text (works for numeric and datetime fields)
  sample_min        TEXT,
  sample_max        TEXT,
  profiled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_id, field_name)
);

ALTER TABLE gigalibs_analytics.source_field_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.source_field_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_profiles_tenant_isolation ON gigalibs_analytics.source_field_profiles;
CREATE POLICY field_profiles_tenant_isolation
  ON gigalibs_analytics.source_field_profiles
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_field_profiles_schema
  ON gigalibs_analytics.source_field_profiles (schema_id);
CREATE INDEX IF NOT EXISTS idx_field_profiles_tenant
  ON gigalibs_analytics.source_field_profiles (tenant_id);

-- ── Table: data_studio_mappings ──────────────────────────────
-- Named user-defined mapping: which source fields map to which
-- analytical fields. A mapping acts as the schema bridge between
-- raw ingested data and published analytical datasets.
-- DRAFT mappings are mutable; only PUBLISHED mappings produce datasets.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.data_studio_mappings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID        NOT NULL
                      REFERENCES gigalibs_analytics.source_connections (id)
                      ON DELETE RESTRICT,
  tenant_id         TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  source_table_name TEXT        NOT NULL,
  -- DRAFT: actively being edited; PUBLISHED: locked, used by datasets
  lifecycle         TEXT        NOT NULL DEFAULT 'DRAFT'
                    CHECK (lifecycle IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by        TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.data_studio_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.data_studio_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_mappings_tenant_isolation ON gigalibs_analytics.data_studio_mappings;
CREATE POLICY studio_mappings_tenant_isolation
  ON gigalibs_analytics.data_studio_mappings
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP TRIGGER IF EXISTS trg_studio_mappings_updated_at ON gigalibs_analytics.data_studio_mappings;
CREATE TRIGGER trg_studio_mappings_updated_at
  BEFORE UPDATE ON gigalibs_analytics.data_studio_mappings
  FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_studio_mappings_tenant
  ON gigalibs_analytics.data_studio_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_studio_mappings_connection
  ON gigalibs_analytics.data_studio_mappings (connection_id, lifecycle);

-- ── Table: studio_mapping_versions ──────────────────────────
-- Immutable snapshot of field-level mappings at each publish.
-- Append-only: UPDATE and DELETE are revoked.
-- Columns: a JSONB array of mapping entries, each:
--   { sourceField, analyticalField, analyticalType, transformHint? }
CREATE TABLE IF NOT EXISTS gigalibs_analytics.studio_mapping_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id        UUID        NOT NULL
                      REFERENCES gigalibs_analytics.data_studio_mappings (id)
                      ON DELETE RESTRICT,
  tenant_id         TEXT        NOT NULL,
  version_number    INTEGER     NOT NULL CHECK (version_number >= 1),
  -- Ordered array of field mapping entries (see above)
  field_mappings    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- SHA-256 hex of canonical JSON of field_mappings
  content_hash      TEXT        NOT NULL,
  published_by      TEXT        NOT NULL,
  published_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mapping_id, version_number)
);

ALTER TABLE gigalibs_analytics.studio_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.studio_mapping_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mapping_versions_tenant_isolation ON gigalibs_analytics.studio_mapping_versions;
CREATE POLICY mapping_versions_tenant_isolation
  ON gigalibs_analytics.studio_mapping_versions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Append-only: revoke UPDATE and DELETE
DO $$
DECLARE _role TEXT := current_user;
BEGIN
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON gigalibs_analytics.studio_mapping_versions FROM %I', _role
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_mapping_versions_mapping
  ON gigalibs_analytics.studio_mapping_versions (mapping_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_versions_tenant
  ON gigalibs_analytics.studio_mapping_versions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_mapping_versions_hash
  ON gigalibs_analytics.studio_mapping_versions (content_hash);

-- ── schema_migrations ledger ─────────────────────────────────
INSERT INTO gigalibs_analytics.schema_migrations (version, description, applied_at)
VALUES (6, 'schema_discovery_and_studio_mappings', now())
ON CONFLICT (version) DO NOTHING;
