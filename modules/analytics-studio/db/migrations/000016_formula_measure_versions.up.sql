-- WI-OI-103b: governed formula measures, immutable definitions and maker-checker decisions.
-- Forward-only. Formula definitions are a validated JSON expression AST; raw SQL is never stored.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE_CREATED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE_VERSION_CREATED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE_SUBMITTED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE_PUBLISHED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE_REJECTED';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'FORMULA_MEASURE';

-- Composite parent keys make tenant binding a database invariant, not merely an API convention.
ALTER TABLE gigalibs_analytics.semantic_models
  ADD CONSTRAINT semantic_models_id_tenant_v16_unique UNIQUE (id, tenant_id);

CREATE TABLE gigalibs_analytics.formula_measures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  measure_name TEXT NOT NULL
    CHECK (measure_name ~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'),
  current_published_version_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semantic_model_id, measure_name),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (semantic_model_id, tenant_id)
    REFERENCES gigalibs_analytics.semantic_models (id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_analytics.formula_measure_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_measure_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formula_measure_id, version_number),
  UNIQUE (formula_measure_id, tenant_id, id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (formula_measure_id, tenant_id)
    REFERENCES gigalibs_analytics.formula_measures (id, tenant_id) ON DELETE RESTRICT
);

-- The composite FK prevents a formula from pointing at another formula's version.
ALTER TABLE gigalibs_analytics.formula_measures
  ADD CONSTRAINT formula_measures_published_version_fk
  FOREIGN KEY (id, tenant_id, current_published_version_id)
  REFERENCES gigalibs_analytics.formula_measure_versions (formula_measure_id, tenant_id, id)
  ON DELETE RESTRICT;

CREATE TABLE gigalibs_analytics.formula_measure_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_measure_version_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  actor_subject TEXT NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formula_measure_version_id, decision),
  FOREIGN KEY (formula_measure_version_id, tenant_id)
    REFERENCES gigalibs_analytics.formula_measure_versions (id, tenant_id) ON DELETE RESTRICT
);

DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['formula_measures', 'formula_measure_versions', 'formula_measure_reviews'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_analytics.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tenant_table || '_tenant_isolation_v16',
      tenant_table
    );
  END LOOP;
END
$$;

-- Versions and decisions are evidence. Corrections create a new version/decision; the runtime may never rewrite them.
REVOKE UPDATE, DELETE ON gigalibs_analytics.formula_measure_versions FROM PUBLIC;
REVOKE UPDATE, DELETE ON gigalibs_analytics.formula_measure_reviews FROM PUBLIC;

CREATE INDEX formula_measures_tenant_model
  ON gigalibs_analytics.formula_measures (tenant_id, semantic_model_id, measure_name);
CREATE INDEX formula_measure_versions_formula
  ON gigalibs_analytics.formula_measure_versions (formula_measure_id, version_number DESC);
CREATE INDEX formula_measure_reviews_version
  ON gigalibs_analytics.formula_measure_reviews (formula_measure_version_id, recorded_at DESC);

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (16, '000016_formula_measure_versions', now());

COMMIT;
