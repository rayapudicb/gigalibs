-- ============================================================
-- Migration 000005: Connector Hub — Sync Runs + Raw Records
-- WI-OI-043 Phase 1: Ingestion audit trail and raw staging
-- ============================================================
-- Forward-only. Never edit. Schema: gigalibs_analytics.

SET search_path TO gigalibs_analytics, public;

-- ── Enum: sync run lifecycle status ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'sync_run_status'
      AND typnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'gigalibs_analytics'
      )
  ) THEN
    CREATE TYPE gigalibs_analytics.sync_run_status
      AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

-- ── Table: source_sync_runs ──────────────────────────────────
-- One row per incremental pull from an external source.
-- Immutable after completion (status transitions: RUNNING → SUCCEEDED|FAILED).
CREATE TABLE IF NOT EXISTS gigalibs_analytics.source_sync_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID        NOT NULL
                      REFERENCES gigalibs_analytics.source_connections (id)
                      ON DELETE RESTRICT,  -- prevent orphan runs
  tenant_id         TEXT        NOT NULL,
  status            gigalibs_analytics.sync_run_status NOT NULL DEFAULT 'RUNNING',
  rows_fetched      BIGINT      NOT NULL DEFAULT 0 CHECK (rows_fetched >= 0),
  -- High-watermark cursor value (opaque — may be a timestamp or a PK offset).
  -- NULL means a full-table scan (first sync or explicit resync).
  watermark_value   TEXT,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- RLS
ALTER TABLE gigalibs_analytics.source_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.source_sync_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_runs_tenant_isolation ON gigalibs_analytics.source_sync_runs;
CREATE POLICY sync_runs_tenant_isolation
  ON gigalibs_analytics.source_sync_runs
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant
  ON gigalibs_analytics.source_sync_runs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_sync_runs_connection_started
  ON gigalibs_analytics.source_sync_runs (connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_status
  ON gigalibs_analytics.source_sync_runs (tenant_id, status);

-- ── Table: raw_record_versions ───────────────────────────────
-- Append-only staging store: one row per source record per sync.
-- UPDATE and DELETE are revoked — this table grows forward only.
-- Individual source rows are identified by a stable hash of their
-- primary key so later phases can detect adds vs. changes.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.raw_record_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id       UUID        NOT NULL
                      REFERENCES gigalibs_analytics.source_sync_runs (id)
                      ON DELETE RESTRICT,
  connection_id     UUID        NOT NULL
                      REFERENCES gigalibs_analytics.source_connections (id)
                      ON DELETE RESTRICT,
  tenant_id         TEXT        NOT NULL,
  source_table_name TEXT        NOT NULL,
  -- SHA-256 hex of the source row's primary key value(s).
  -- Stable across syncs so delta detection works across versions.
  source_pk_hash    TEXT        NOT NULL,
  -- Full source row captured as JSONB.
  -- Keys are column names (as returned by the pg driver).
  -- Values are JSON-serialised column values.
  raw_payload       JSONB       NOT NULL,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE gigalibs_analytics.raw_record_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.raw_record_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_records_tenant_isolation ON gigalibs_analytics.raw_record_versions;
CREATE POLICY raw_records_tenant_isolation
  ON gigalibs_analytics.raw_record_versions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Append-only enforcement: revoke UPDATE and DELETE.
-- The analytics runtime role must not be a superuser (enforced by
-- DatabaseService bootstrapCheck). Superuser bypass is blocked in prod.
DO $$
DECLARE
  _role TEXT := current_user;
BEGIN
  -- Revoke from the runtime role; ignore if already absent.
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON gigalibs_analytics.raw_record_versions FROM %I',
    _role
  );
EXCEPTION WHEN OTHERS THEN
  -- Ignore: role may not hold these privileges.
  NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_records_tenant
  ON gigalibs_analytics.raw_record_versions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_raw_records_sync_run
  ON gigalibs_analytics.raw_record_versions (sync_run_id);

CREATE INDEX IF NOT EXISTS idx_raw_records_connection_table
  ON gigalibs_analytics.raw_record_versions (connection_id, source_table_name);

CREATE INDEX IF NOT EXISTS idx_raw_records_pk_hash
  ON gigalibs_analytics.raw_record_versions (connection_id, source_table_name, source_pk_hash);

-- GIN index on raw_payload for JSONB path queries in schema discovery
CREATE INDEX IF NOT EXISTS idx_raw_records_payload_gin
  ON gigalibs_analytics.raw_record_versions USING GIN (raw_payload);

-- ── schema_migrations ledger ─────────────────────────────────
INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (5, 'connector_sync_runs_and_raw_records', now())
ON CONFLICT (version) DO NOTHING;
