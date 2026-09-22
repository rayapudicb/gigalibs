-- ============================================================================
-- WI-OI-043 Phase 5 — Charts, Dashboards, Governed Query Engine
-- Migration: 000008_charts_and_dashboards
-- Forward-only (never edit; add a new migration to alter schema)
-- ============================================================================

SET search_path = gigalibs_analytics, public;

-- ── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chart_type') THEN
    CREATE TYPE chart_type AS ENUM (
      'BAR', 'LINE', 'PIE', 'SCATTER', 'AREA',
      'HEATMAP', 'TREEMAP', 'FUNNEL', 'GAUGE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'freshness_state') THEN
    CREATE TYPE freshness_state AS ENUM (
      'FRESH', 'STALE', 'PARTIAL', 'REBUILDING', 'UNAVAILABLE'
      -- NOTE: 'UNAUTHORIZED' is never a freshness state.
      --       Authorization failures are HTTP 403/401, not a data staleness signal.
    );
  END IF;
END $$;

-- ── chart_definitions ────────────────────────────────────────────────────────
-- Stores the governed chart specification: which semantic model + measure +
-- ECharts option template drives this chart.
-- chart_options_template is a JSONB partial ECharts option that the query
-- engine fills with real data at render time (no hardcoded values allowed).

CREATE TABLE IF NOT EXISTS gigalibs_analytics.chart_definitions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    semantic_model_id     UUID        NOT NULL
                          REFERENCES gigalibs_analytics.semantic_models(id)
                          ON DELETE RESTRICT,
    tenant_id             TEXT        NOT NULL,
    display_name          TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
    description           TEXT,
    chart_type            gigalibs_analytics.chart_type NOT NULL,
    -- Governs which measures from the semantic model appear in this chart.
    -- Array of measure_names from semantic_measures; validated at write time
    -- by the application layer (can't enforce FK into JSONB column here).
    measure_names         TEXT[]      NOT NULL CHECK (array_length(measure_names, 1) >= 1),
    -- Optional grouping dimension (must be an analyticalField name in the dataset)
    dimension_field       TEXT,
    -- Optional time window for auto-staleness computation (seconds)
    freshness_ttl_seconds INTEGER     CHECK (freshness_ttl_seconds IS NULL OR freshness_ttl_seconds > 0),
    -- Partial ECharts option template — filled by query engine at render time
    chart_options_template JSONB      NOT NULL DEFAULT '{}',
    created_by            TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.chart_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.chart_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY chart_definitions_tenant_isolation
    ON gigalibs_analytics.chart_definitions
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE TRIGGER trg_chart_definitions_updated_at
    BEFORE UPDATE ON gigalibs_analytics.chart_definitions
    FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

-- ── dashboards ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_analytics.dashboards (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT        NOT NULL,
    display_name TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
    description  TEXT,
    created_by   TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.dashboards FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboards_tenant_isolation
    ON gigalibs_analytics.dashboards
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE TRIGGER trg_dashboards_updated_at
    BEFORE UPDATE ON gigalibs_analytics.dashboards
    FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

-- ── dashboard_charts (layout join table) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_analytics.dashboard_charts (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id      UUID        NOT NULL
                      REFERENCES gigalibs_analytics.dashboards(id)
                      ON DELETE CASCADE,
    chart_definition_id UUID      NOT NULL
                      REFERENCES gigalibs_analytics.chart_definitions(id)
                      ON DELETE RESTRICT,
    tenant_id         TEXT        NOT NULL,
    -- Grid position (column/row index, span) for responsive layout
    grid_col          INTEGER     NOT NULL DEFAULT 0 CHECK (grid_col >= 0),
    grid_row          INTEGER     NOT NULL DEFAULT 0 CHECK (grid_row >= 0),
    col_span          INTEGER     NOT NULL DEFAULT 1 CHECK (col_span >= 1 AND col_span <= 12),
    row_span          INTEGER     NOT NULL DEFAULT 1 CHECK (row_span >= 1),
    sort_order        INTEGER     NOT NULL DEFAULT 0,
    UNIQUE (dashboard_id, chart_definition_id)
);

ALTER TABLE gigalibs_analytics.dashboard_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.dashboard_charts FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_charts_tenant_isolation
    ON gigalibs_analytics.dashboard_charts
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── dashboard_filters ─────────────────────────────────────────────────────────
-- Named, reusable filter expressions stored per dashboard.
-- Applied at query-engine time, never interpolated into raw SQL
-- (values go through parameterised queries only).

CREATE TABLE IF NOT EXISTS gigalibs_analytics.dashboard_filters (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id   UUID        NOT NULL
                   REFERENCES gigalibs_analytics.dashboards(id)
                   ON DELETE CASCADE,
    tenant_id      TEXT        NOT NULL,
    filter_name    TEXT        NOT NULL CHECK (filter_name ~ '^[a-zA-Z][a-zA-Z0-9_]{0,62}$'),
    field_name     TEXT        NOT NULL,
    operator       TEXT        NOT NULL
                   CHECK (operator IN ('EQ','NEQ','GT','GTE','LT','LTE','IN','BETWEEN','LIKE')),
    -- Serialised filter value(s); always bound as query parameters, never interpolated
    filter_value   JSONB       NOT NULL,
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dashboard_id, filter_name)
);

ALTER TABLE gigalibs_analytics.dashboard_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.dashboard_filters FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_filters_tenant_isolation
    ON gigalibs_analytics.dashboard_filters
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── query_result_cache (ephemeral; evicted by TTL, never used as source of truth) ──

CREATE TABLE IF NOT EXISTS gigalibs_analytics.query_result_cache (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_definition_id   UUID        NOT NULL
                          REFERENCES gigalibs_analytics.chart_definitions(id)
                          ON DELETE CASCADE,
    tenant_id             TEXT        NOT NULL,
    dataset_version_id    UUID        NOT NULL,
    freshness             gigalibs_analytics.freshness_state NOT NULL,
    result_payload        JSONB       NOT NULL,
    computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL,
    -- Watermark at time of query for freshness tracking
    watermark_value       TEXT
);

ALTER TABLE gigalibs_analytics.query_result_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.query_result_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY query_result_cache_tenant_isolation
    ON gigalibs_analytics.query_result_cache
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE INDEX idx_qrc_chart_tenant_expires
    ON gigalibs_analytics.query_result_cache (chart_definition_id, tenant_id, expires_at);

-- ── Schema migrations ledger ─────────────────────────────────────────────────

INSERT INTO gigalibs_analytics.schema_migrations (version, description, applied_at)
VALUES (8, '000008_charts_and_dashboards', now())
ON CONFLICT (version) DO NOTHING;
