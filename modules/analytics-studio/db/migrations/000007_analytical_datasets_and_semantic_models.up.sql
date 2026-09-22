-- ============================================================
-- Migration 000007: Analytical Datasets + Semantic Models
-- WI-OI-043 Phase 4: Immutable versioned datasets and governed DSL
-- ============================================================
-- Forward-only. Never edit. Schema: gigalibs_analytics.

SET search_path TO gigalibs_analytics, public;

-- ── Table: analytical_dataset_versions ──────────────────────
-- Each published dataset is an immutable, checksummed snapshot produced
-- by applying a studio mapping to ingested raw records.
-- A new version is created for each publish; prior versions are kept.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.analytical_dataset_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id        UUID        NOT NULL
                      REFERENCES gigalibs_analytics.data_studio_mappings (id)
                      ON DELETE RESTRICT,
  -- The specific mapping version this dataset was built from
  mapping_version   INTEGER     NOT NULL CHECK (mapping_version >= 1),
  tenant_id         TEXT        NOT NULL,
  version_number    INTEGER     NOT NULL CHECK (version_number >= 1),
  -- BUILDING: dataset is being assembled; READY: queryable; FAILED: assembly error
  build_status      TEXT        NOT NULL DEFAULT 'BUILDING'
                    CHECK (build_status IN ('BUILDING', 'READY', 'FAILED')),
  record_count      BIGINT      NOT NULL DEFAULT 0,
  -- SHA-256 hex of sorted field names + record count (lightweight content fingerprint)
  content_checksum  TEXT,
  build_error       TEXT,
  built_by          TEXT        NOT NULL,
  built_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  UNIQUE (mapping_id, version_number)
);

ALTER TABLE gigalibs_analytics.analytical_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.analytical_dataset_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dataset_versions_tenant_isolation ON gigalibs_analytics.analytical_dataset_versions;
CREATE POLICY dataset_versions_tenant_isolation
  ON gigalibs_analytics.analytical_dataset_versions
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_dataset_versions_tenant
  ON gigalibs_analytics.analytical_dataset_versions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_mapping
  ON gigalibs_analytics.analytical_dataset_versions (mapping_id, version_number DESC);

-- ── Table: dataset_record_versions ──────────────────────────
-- Append-only store of analytical records per dataset version.
-- Each row is a transformed source record expressed in the analytical schema.
-- UPDATE and DELETE are revoked (immutable once written).
CREATE TABLE IF NOT EXISTS gigalibs_analytics.dataset_record_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID       NOT NULL
                      REFERENCES gigalibs_analytics.analytical_dataset_versions (id)
                      ON DELETE RESTRICT,
  mapping_id        UUID        NOT NULL,
  tenant_id         TEXT        NOT NULL,
  -- Analytical record as JSONB (keys = analyticalField names from mapping)
  analytical_payload JSONB      NOT NULL,
  -- Hash of source record for delta detection
  source_pk_hash    TEXT        NOT NULL,
  published_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.dataset_record_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.dataset_record_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dataset_records_tenant_isolation ON gigalibs_analytics.dataset_record_versions;
CREATE POLICY dataset_records_tenant_isolation
  ON gigalibs_analytics.dataset_record_versions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Append-only enforcement
DO $$
DECLARE _role TEXT := current_user;
BEGIN
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON gigalibs_analytics.dataset_record_versions FROM %I', _role
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_dataset_records_version
  ON gigalibs_analytics.dataset_record_versions (dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_tenant
  ON gigalibs_analytics.dataset_record_versions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_payload_gin
  ON gigalibs_analytics.dataset_record_versions USING GIN (analytical_payload);

-- ── Table: semantic_models ───────────────────────────────────
-- Named semantic model: groups measures and dimensions over a dataset.
-- Provides governed, SQL-free access to analytical data.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.semantic_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID NOT NULL
                      REFERENCES gigalibs_analytics.analytical_dataset_versions (id)
                      ON DELETE RESTRICT,
  tenant_id         TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  description       TEXT,
  created_by        TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.semantic_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.semantic_models FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_models_tenant_isolation ON gigalibs_analytics.semantic_models;
CREATE POLICY semantic_models_tenant_isolation
  ON gigalibs_analytics.semantic_models
  USING (tenant_id = current_setting('app.tenant_id', true));

DROP TRIGGER IF EXISTS trg_semantic_models_updated_at ON gigalibs_analytics.semantic_models;
CREATE TRIGGER trg_semantic_models_updated_at
  BEFORE UPDATE ON gigalibs_analytics.semantic_models
  FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_semantic_models_tenant
  ON gigalibs_analytics.semantic_models (tenant_id);
CREATE INDEX IF NOT EXISTS idx_semantic_models_dataset
  ON gigalibs_analytics.semantic_models (dataset_version_id);

-- ── Table: semantic_measures ─────────────────────────────────
-- Individual measures (aggregations) defined within a semantic model.
-- Expressed as a governed DSL (aggregate function + field reference).
-- No raw SQL is stored here — queries are built by the query engine.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.semantic_measures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID        NOT NULL
                      REFERENCES gigalibs_analytics.semantic_models (id)
                      ON DELETE CASCADE,
  tenant_id         TEXT        NOT NULL,
  measure_name      TEXT        NOT NULL,
  -- Aggregate function: SUM | AVG | COUNT | COUNT_DISTINCT | MIN | MAX
  aggregate_fn      TEXT        NOT NULL
                    CHECK (aggregate_fn IN ('SUM','AVG','COUNT','COUNT_DISTINCT','MIN','MAX')),
  -- Analytical field name from the dataset schema
  field_reference   TEXT        NOT NULL,
  display_label     TEXT        NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, measure_name)
);

ALTER TABLE gigalibs_analytics.semantic_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.semantic_measures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_measures_tenant_isolation ON gigalibs_analytics.semantic_measures;
CREATE POLICY semantic_measures_tenant_isolation
  ON gigalibs_analytics.semantic_measures
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX IF NOT EXISTS idx_semantic_measures_model
  ON gigalibs_analytics.semantic_measures (model_id);
CREATE INDEX IF NOT EXISTS idx_semantic_measures_tenant
  ON gigalibs_analytics.semantic_measures (tenant_id);

-- ── Table: semantic_model_versions ──────────────────────────
-- Immutable snapshot of a semantic model's measures at each save.
-- Append-only: UPDATE and DELETE are revoked.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.semantic_model_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID        NOT NULL
                      REFERENCES gigalibs_analytics.semantic_models (id)
                      ON DELETE RESTRICT,
  tenant_id         TEXT        NOT NULL,
  version_number    INTEGER     NOT NULL CHECK (version_number >= 1),
  -- Snapshot of measures at this version (JSONB array)
  measures_snapshot JSONB       NOT NULL DEFAULT '[]'::jsonb,
  content_hash      TEXT        NOT NULL,
  saved_by          TEXT        NOT NULL,
  saved_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, version_number)
);

ALTER TABLE gigalibs_analytics.semantic_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.semantic_model_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_versions_tenant_isolation ON gigalibs_analytics.semantic_model_versions;
CREATE POLICY model_versions_tenant_isolation
  ON gigalibs_analytics.semantic_model_versions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Append-only enforcement
DO $$
DECLARE _role TEXT := current_user;
BEGIN
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON gigalibs_analytics.semantic_model_versions FROM %I', _role
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_model_versions_model
  ON gigalibs_analytics.semantic_model_versions (model_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_model_versions_tenant
  ON gigalibs_analytics.semantic_model_versions (tenant_id);

-- ── schema_migrations ledger ─────────────────────────────────
INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (7, 'analytical_datasets_and_semantic_models', now())
ON CONFLICT (version) DO NOTHING;
