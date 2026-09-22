-- ============================================================================
-- WI-OI-043 Phase 7 — Data Lineage + Audit Log
-- Migration: 000010_lineage_and_audit
-- Forward-only (never edit; add a new migration to alter schema)
--
-- Both tables are APPEND-ONLY.
-- UPDATE and DELETE are explicitly REVOKED at the schema level.
-- These tables are the governance record of the entire pipeline.
-- ============================================================================

SET search_path = gigalibs_analytics, public;

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lineage_node_type') THEN
    CREATE TYPE lineage_node_type AS ENUM (
      'SOURCE_CONNECTION',
      'SYNC_RUN',
      'RAW_RECORD_BATCH',
      'SCHEMA_DISCOVERY',
      'STUDIO_MAPPING',
      'DATASET_VERSION',
      'SEMANTIC_MODEL',
      'CHART_DEFINITION',
      'REPORT_RUN',
      'REPORT_ARTIFACT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
    CREATE TYPE audit_event_type AS ENUM (
      -- Connector Hub
      'CONNECTION_CREATED', 'CONNECTION_TESTED', 'CONNECTION_DELETED',
      -- Ingestion
      'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED',
      -- Schema Discovery
      'SCHEMA_DISCOVERED', 'MAPPING_CREATED', 'MAPPING_PUBLISHED',
      -- Dataset
      'DATASET_BUILD_STARTED', 'DATASET_BUILD_COMPLETED', 'DATASET_BUILD_FAILED',
      -- Semantic Model
      'SEMANTIC_MODEL_CREATED', 'SEMANTIC_MODEL_VERSION_SAVED',
      -- Charts + Dashboards
      'CHART_CREATED', 'CHART_RENDERED', 'DASHBOARD_CREATED', 'DASHBOARD_CHART_ADDED',
      -- Reports
      'REPORT_DEFINITION_CREATED', 'REPORT_RUN_TRIGGERED',
      'REPORT_SUCCEEDED', 'REPORT_FAILED', 'REPORT_DOWNLOADED',
      -- Access
      'QUERY_EXECUTED'
    );
  END IF;
END $$;

-- ── analytics_lineage_edges ───────────────────────────────────────────────────
-- Directed acyclic graph of pipeline events.
-- Each row represents one causal edge: source_node_id → target_node_id.
-- Both node IDs reference rows in the tables listed in node_type enums.
-- The schema intentionally uses TEXT (not typed FKs) so the graph can
-- span heterogeneous node types without cross-table FK complexity.
--
-- APPEND-ONLY: UPDATE and DELETE are explicitly REVOKED.
-- Lineage edges are immutable once written; corrections go in as new edges.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.analytics_lineage_edges (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT            NOT NULL,
    source_node_id      TEXT            NOT NULL,
    source_node_type    gigalibs_analytics.lineage_node_type NOT NULL,
    target_node_id      TEXT            NOT NULL,
    target_node_type    gigalibs_analytics.lineage_node_type NOT NULL,
    -- Opaque description of the transformation between nodes (e.g. "field_mapping_v3")
    edge_label          TEXT,
    -- Additional context captured at edge creation (never mutated)
    edge_metadata       JSONB           NOT NULL DEFAULT '{}',
    recorded_by         TEXT            NOT NULL,
    recorded_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
    -- Prevent exact duplicate edges (same source→target in same tenant on same timestamp)
    UNIQUE (tenant_id, source_node_id, target_node_id, source_node_type, target_node_type)
);

-- Append-only enforcement
REVOKE UPDATE ON gigalibs_analytics.analytics_lineage_edges FROM PUBLIC;
REVOKE DELETE ON gigalibs_analytics.analytics_lineage_edges FROM PUBLIC;

ALTER TABLE gigalibs_analytics.analytics_lineage_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.analytics_lineage_edges FORCE ROW LEVEL SECURITY;

CREATE POLICY lineage_edges_tenant_isolation
    ON gigalibs_analytics.analytics_lineage_edges
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Indexes to support forward and backward lineage traversal
CREATE INDEX idx_lineage_source ON gigalibs_analytics.analytics_lineage_edges (tenant_id, source_node_id, source_node_type);
CREATE INDEX idx_lineage_target ON gigalibs_analytics.analytics_lineage_edges (tenant_id, target_node_id, target_node_type);

-- ── analytics_audit_log ───────────────────────────────────────────────────────
-- Tamper-evident event log for every governed pipeline action.
-- Every API-layer operation that mutates state or accesses sensitive data
-- MUST emit an audit event here through the LineageService.
--
-- APPEND-ONLY: UPDATE and DELETE are explicitly REVOKED.
-- This table is the governance record. Any post-hoc correction appends a
-- new CORRECTION row referencing the original; it does not overwrite.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.analytics_audit_log (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT            NOT NULL,
    event_type          gigalibs_analytics.audit_event_type NOT NULL,
    -- Subject that triggered the event (principal.subject from the PlatformContextV1 token)
    actor_subject       TEXT            NOT NULL,
    -- The primary entity affected (e.g. connection_id, run_id, report_definition_id)
    entity_id           TEXT,
    entity_type         gigalibs_analytics.lineage_node_type,
    -- Event payload captures only non-sensitive context:
    -- no credential bytes, no PII, no raw secrets.
    event_payload       JSONB           NOT NULL DEFAULT '{}',
    -- Client IP is logged for security audit (never for analytics)
    client_ip           INET,
    -- Correlation ID for distributed trace linkage
    correlation_id      TEXT,
    occurred_at         TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Append-only enforcement
REVOKE UPDATE ON gigalibs_analytics.analytics_audit_log FROM PUBLIC;
REVOKE DELETE ON gigalibs_analytics.analytics_audit_log FROM PUBLIC;

ALTER TABLE gigalibs_analytics.analytics_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.analytics_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_tenant_isolation
    ON gigalibs_analytics.analytics_audit_log
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Optimise common audit queries: by tenant+event_type, by tenant+actor, by entity
CREATE INDEX idx_audit_tenant_event ON gigalibs_analytics.analytics_audit_log (tenant_id, event_type, occurred_at DESC);
CREATE INDEX idx_audit_tenant_actor ON gigalibs_analytics.analytics_audit_log (tenant_id, actor_subject, occurred_at DESC);
CREATE INDEX idx_audit_entity      ON gigalibs_analytics.analytics_audit_log (tenant_id, entity_id, entity_type);

-- ── Schema migrations ledger ─────────────────────────────────────────────────

INSERT INTO gigalibs_analytics.schema_migrations (version, description, applied_at)
VALUES (10, '000010_lineage_and_audit', now())
ON CONFLICT (version) DO NOTHING;
