-- WI-OI-103e (ADR-0016 F11): Analytics owns reports. A report is a saved chart view or a dashboard exported as CSV;
-- the old chart-definition source stays only for existing rows. Each artifact keeps its CSV bytes, so a download
-- survives a restart (the previous in-memory store did not). Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'REPORT_DEFINITION_CREATED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'REPORT_RUN_COMPLETED';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'REPORT_DEFINITION';

ALTER TABLE gigalibs_analytics.report_definitions
  ALTER COLUMN chart_definition_id DROP NOT NULL,
  ADD COLUMN chart_view_id UUID,
  ADD COLUMN dashboard_id UUID,
  ADD CONSTRAINT report_definitions_id_tenant_unique UNIQUE (id, tenant_id),
  -- Composite keys bind a report to a chart view or dashboard of the same tenant.
  ADD CONSTRAINT report_definitions_chart_view_fk
    FOREIGN KEY (chart_view_id, tenant_id) REFERENCES gigalibs_analytics.chart_views (id, tenant_id) ON DELETE RESTRICT,
  ADD CONSTRAINT report_definitions_dashboard_fk
    FOREIGN KEY (dashboard_id, tenant_id) REFERENCES gigalibs_analytics.dashboards (id, tenant_id) ON DELETE RESTRICT,
  ADD CONSTRAINT report_definitions_one_source
    CHECK (num_nonnulls(chart_definition_id, chart_view_id, dashboard_id) = 1);

ALTER TABLE gigalibs_analytics.report_artifacts
  ADD COLUMN content BYTEA,
  ADD CONSTRAINT report_artifacts_content_size CHECK (content IS NULL OR octet_length(content) = byte_size);

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (20, '000020_reports_from_chart_views', now());

COMMIT;
