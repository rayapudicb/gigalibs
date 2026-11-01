-- WI-OI-131 B8: contract-pinned module semantic models and mapping compile manifests.
BEGIN;

ALTER TABLE gigalibs_analytics.semantic_models
  ADD COLUMN IF NOT EXISTS module_source_key TEXT,
  ADD COLUMN IF NOT EXISTS contract_version INTEGER CHECK (contract_version IS NULL OR contract_version >= 1),
  ADD COLUMN IF NOT EXISTS compiled_measure_manifest JSONB;

ALTER TABLE gigalibs_analytics.studio_mapping_versions
  ADD COLUMN IF NOT EXISTS module_compile_manifest JSONB;

ALTER TABLE gigalibs_analytics.chart_views
  ADD COLUMN IF NOT EXISTS pinned_contract_version INTEGER CHECK (pinned_contract_version IS NULL OR pinned_contract_version >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_models_module_source_uq
  ON gigalibs_analytics.semantic_models (tenant_id, module_source_key)
  WHERE module_source_key IS NOT NULL;

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (34, '000034_module_compiled_semantics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
