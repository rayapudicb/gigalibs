-- WI-OI-103e: dashboards are saved chart views plus shared filters. A dashboard stores which filters it offers, never
-- data or chosen values. Tiles replace the old chart-definition links (dashboard_charts, dashboard_filters), which stay
-- unused until the old chart routes retire with reports (e5). Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'DASHBOARD_CREATED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'DASHBOARD_UPDATED';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'DASHBOARD';

ALTER TABLE gigalibs_analytics.dashboards
  ADD COLUMN time_range BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN shared_filters JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(shared_filters) = 'array'),
  ADD CONSTRAINT dashboards_id_tenant_unique UNIQUE (id, tenant_id);

CREATE TABLE gigalibs_analytics.dashboard_tiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  dashboard_id UUID NOT NULL,
  chart_view_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 11),
  size TEXT NOT NULL CHECK (size IN ('small', 'medium', 'large')),
  UNIQUE (dashboard_id, position),
  UNIQUE (dashboard_id, chart_view_id),
  -- Composite keys bind a tile to a dashboard and a chart view of the same tenant.
  FOREIGN KEY (dashboard_id, tenant_id)
    REFERENCES gigalibs_analytics.dashboards (id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (chart_view_id, tenant_id)
    REFERENCES gigalibs_analytics.chart_views (id, tenant_id) ON DELETE RESTRICT
);

ALTER TABLE gigalibs_analytics.dashboard_tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.dashboard_tiles FORCE ROW LEVEL SECURITY;
CREATE POLICY dashboard_tiles_tenant_isolation_v19 ON gigalibs_analytics.dashboard_tiles
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX dashboard_tiles_chart_view ON gigalibs_analytics.dashboard_tiles (tenant_id, chart_view_id);

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (19, '000019_dashboards_of_chart_views', now());

COMMIT;
