-- WI-OI-103d: chart views. A chart view stores a question (AnalyticsQueryV1) and how to draw it (chart type), never
-- data; drawing it runs the stored query. Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'CHART_VIEW_CREATED';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'CHART_VIEW';

CREATE TABLE gigalibs_analytics.chart_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  semantic_model_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  query_spec JSONB NOT NULL CHECK (jsonb_typeof(query_spec) = 'object'),
  visual_spec JSONB NOT NULL CHECK (jsonb_typeof(visual_spec) = 'object'),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  -- The composite key from migration 000016 binds a view to a model of the same tenant.
  FOREIGN KEY (semantic_model_id, tenant_id)
    REFERENCES gigalibs_analytics.semantic_models (id, tenant_id) ON DELETE RESTRICT
);

ALTER TABLE gigalibs_analytics.chart_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.chart_views FORCE ROW LEVEL SECURITY;
CREATE POLICY chart_views_tenant_isolation_v17 ON gigalibs_analytics.chart_views
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX chart_views_tenant_created ON gigalibs_analytics.chart_views (tenant_id, created_at DESC);

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (17, '000017_chart_views', now());

COMMIT;
