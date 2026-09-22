-- ============================================================================
-- WI-OI-043 Phase 6 — Reports, CSV Export, Scheduled Delivery
-- Migration: 000009_reports_and_scheduled_delivery
-- Forward-only (never edit; add a new migration to alter schema)
-- ============================================================================

SET search_path = gigalibs_analytics, public;

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_channel') THEN
    CREATE TYPE delivery_channel AS ENUM ('EMAIL', 'WEBHOOK', 'SFTP', 'IN_APP');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'DUPLICATE_SUPPRESSED');
  END IF;
END $$;

-- ── report_definitions ────────────────────────────────────────────────────────
-- A report template that binds to a chart_definition and declares:
--   - output_format (CSV only for Phase 6; XLSX in Phase 7+)
--   - Input parameters pinned at request time (no deferred resolution)

CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_definitions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_definition_id   UUID        NOT NULL
                          REFERENCES gigalibs_analytics.chart_definitions(id)
                          ON DELETE RESTRICT,
    tenant_id             TEXT        NOT NULL,
    display_name          TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
    description           TEXT,
    -- Pinned input parameters captured at report creation (immutable)
    pinned_inputs         JSONB       NOT NULL DEFAULT '{}',
    output_format         TEXT        NOT NULL
                          CHECK (output_format IN ('CSV')),
    created_by            TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY report_definitions_tenant_isolation
    ON gigalibs_analytics.report_definitions
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE TRIGGER trg_report_definitions_updated_at
    BEFORE UPDATE ON gigalibs_analytics.report_definitions
    FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

-- ── report_runs ───────────────────────────────────────────────────────────────
-- One row per execution of a report_definition.
-- Inputs are re-pinned at run time so the report snapshot is reproducible.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_runs (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_definition_id  UUID        NOT NULL
                          REFERENCES gigalibs_analytics.report_definitions(id)
                          ON DELETE RESTRICT,
    tenant_id             TEXT        NOT NULL,
    status                gigalibs_analytics.report_status NOT NULL DEFAULT 'QUEUED',
    -- Snapshot of the query response used for this run (pinned at start time)
    pinned_query_snapshot JSONB,
    -- Idempotency key: callers supply this to deduplicate concurrent submissions
    idempotency_key       TEXT,
    error_message         TEXT,
    row_count             INTEGER,
    triggered_by          TEXT        NOT NULL,
    queued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    UNIQUE (report_definition_id, idempotency_key) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE gigalibs_analytics.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY report_runs_tenant_isolation
    ON gigalibs_analytics.report_runs
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE INDEX idx_report_runs_definition_status
    ON gigalibs_analytics.report_runs (report_definition_id, status);

-- ── report_artifacts ──────────────────────────────────────────────────────────
-- The generated output file. Only the download token is stored here;
-- the actual bytes live in the configured object store (Credential-Vault-scoped
-- presigned URL or equivalent). Tokens expire; repeat requests are refused.
--
-- Append-only: no UPDATE or DELETE permitted on artifact rows.
-- A new run always produces a new artifact row.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_artifacts (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID        NOT NULL
                          REFERENCES gigalibs_analytics.report_runs(id)
                          ON DELETE RESTRICT,
    tenant_id             TEXT        NOT NULL,
    filename              TEXT        NOT NULL,
    content_type          TEXT        NOT NULL DEFAULT 'text/csv',
    -- SHA-256 hex of the artifact bytes for integrity verification
    content_sha256        TEXT        NOT NULL,
    byte_size             BIGINT      NOT NULL CHECK (byte_size >= 0),
    -- One-time download token; short-lived (ttl tracked separately)
    download_token        TEXT        NOT NULL UNIQUE,
    token_expires_at      TIMESTAMPTZ NOT NULL,
    -- Opaque reference to the object-store location (no raw bytes here)
    storage_ref           TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only enforcement
REVOKE UPDATE ON gigalibs_analytics.report_artifacts FROM PUBLIC;
REVOKE DELETE ON gigalibs_analytics.report_artifacts FROM PUBLIC;

ALTER TABLE gigalibs_analytics.report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY report_artifacts_tenant_isolation
    ON gigalibs_analytics.report_artifacts
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE INDEX idx_report_artifacts_token ON gigalibs_analytics.report_artifacts (download_token, token_expires_at);

-- ── report_schedules ──────────────────────────────────────────────────────────
-- Cron-style schedule for recurring report generation.
-- next_run_at is maintained by the scheduler worker.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_schedules (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_definition_id  UUID        NOT NULL
                          REFERENCES gigalibs_analytics.report_definitions(id)
                          ON DELETE CASCADE,
    tenant_id             TEXT        NOT NULL,
    -- POSIX cron expression (5-field): "0 8 * * 1" = every Monday 08:00 UTC
    cron_expression       TEXT        NOT NULL,
    is_enabled            BOOLEAN     NOT NULL DEFAULT true,
    -- Delivery channel for scheduled runs
    delivery_channel      gigalibs_analytics.delivery_channel NOT NULL DEFAULT 'IN_APP',
    -- Opaque delivery target (email address, webhook URL, etc.)
    -- No PII or secrets stored in plaintext: targets are Credential Vault refs
    delivery_target_ref   TEXT        NOT NULL,
    -- ISO 8601 timestamp of next scheduled execution (updated by worker)
    next_run_at           TIMESTAMPTZ,
    created_by            TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gigalibs_analytics.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY report_schedules_tenant_isolation
    ON gigalibs_analytics.report_schedules
    USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE TRIGGER trg_report_schedules_updated_at
    BEFORE UPDATE ON gigalibs_analytics.report_schedules
    FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

-- ── report_deliveries ─────────────────────────────────────────────────────────
-- One delivery attempt record per (run, channel).
-- Duplicates are suppressed by the UNIQUE constraint on (run_id, content_sha256).
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS gigalibs_analytics.report_deliveries (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID        NOT NULL
                          REFERENCES gigalibs_analytics.report_runs(id)
                          ON DELETE RESTRICT,
    tenant_id             TEXT        NOT NULL,
    delivery_channel      gigalibs_analytics.delivery_channel NOT NULL,
    delivery_target_ref   TEXT        NOT NULL,
    status                gigalibs_analytics.delivery_status NOT NULL DEFAULT 'PENDING',
    -- SHA-256 of the artifact content: duplicate suppression key
    content_sha256        TEXT        NOT NULL,
    -- Delivery receipt from the remote endpoint (if applicable)
    delivery_receipt      JSONB,
    error_message         TEXT,
    attempted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at          TIMESTAMPTZ,
    -- Duplicate suppression: one delivery per (run_id, content hash)
    UNIQUE (run_id, content_sha256)
);

-- Append-only enforcement
REVOKE UPDATE ON gigalibs_analytics.report_deliveries FROM PUBLIC;
REVOKE DELETE ON gigalibs_analytics.report_deliveries FROM PUBLIC;

ALTER TABLE gigalibs_analytics.report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.report_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY report_deliveries_tenant_isolation
    ON gigalibs_analytics.report_deliveries
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Schema migrations ledger ─────────────────────────────────────────────────

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (9, '000009_reports_and_scheduled_delivery', now())
ON CONFLICT (version) DO NOTHING;
