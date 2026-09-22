-- ============================================================
-- Migration 000004: Connector Hub — Source Connections
-- WI-OI-043 Phase 1: External data source registration
-- ============================================================
-- Forward-only. Never edit. Schema: gigalibs_analytics.
-- Preceding migrations (000001-000003) use old cross-module
-- model — they are preserved as-is and never referenced here.

SET search_path TO gigalibs_analytics, public;

-- ── Enum: supported external source types ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'external_source_type'
      AND typnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'gigalibs_analytics'
      )
  ) THEN
    CREATE TYPE gigalibs_analytics.external_source_type AS ENUM ('POSTGRES');
  END IF;
END $$;

-- ── Enum: connection lifecycle status ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'connection_status'
      AND typnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'gigalibs_analytics'
      )
  ) THEN
    CREATE TYPE gigalibs_analytics.connection_status
      AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'DISABLED');
  END IF;
END $$;

-- ── Table: source_connections ────────────────────────────────
-- One row per registered external data source per tenant.
-- Credentials are NEVER stored here; they live in the
-- credential vault and are referenced by key only.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.source_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  source_type     gigalibs_analytics.external_source_type NOT NULL,
  host            TEXT        NOT NULL,
  port            INTEGER     NOT NULL CHECK (port BETWEEN 1 AND 65535),
  database_name   TEXT        NOT NULL,
  -- ssl_mode follows libpq convention: disable | allow | prefer | require | verify-ca | verify-full
  ssl_mode        TEXT        NOT NULL DEFAULT 'require'
                  CHECK (ssl_mode IN (
                    'disable','allow','prefer','require','verify-ca','verify-full'
                  )),
  status          gigalibs_analytics.connection_status NOT NULL DEFAULT 'PENDING',
  created_by      TEXT        NOT NULL,  -- subject from PlatformContextV1
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS — tenant isolation
ALTER TABLE gigalibs_analytics.source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.source_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS source_connections_tenant_isolation ON gigalibs_analytics.source_connections;
CREATE POLICY source_connections_tenant_isolation
  ON gigalibs_analytics.source_connections
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_source_connections_tenant
  ON gigalibs_analytics.source_connections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_source_connections_tenant_status
  ON gigalibs_analytics.source_connections (tenant_id, status);

-- ── Table: connector_credential_refs ────────────────────────
-- References (pointers) to credentials stored in the external
-- credential vault. Raw secrets are NEVER written here.
CREATE TABLE IF NOT EXISTS gigalibs_analytics.connector_credential_refs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL
                         REFERENCES gigalibs_analytics.source_connections (id)
                         ON DELETE CASCADE,
  -- Opaque key used to retrieve the real credential from the vault.
  -- Format: <vault-provider>/<scope>/<secret-name>
  -- e.g.   "hashicorp-vault/analytics-studio-prod/pg-cred-acme-corp"
  credential_vault_key TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One credential ref per connection (unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_credential_refs_connection
  ON gigalibs_analytics.connector_credential_refs (connection_id);

-- RLS — join through parent connection; enforce tenant via connection
-- Credential refs share the parent connection's tenant scope.
-- Access control is enforced at the service layer (connection lookup
-- already filtered by RLS on source_connections).
ALTER TABLE gigalibs_analytics.connector_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.connector_credential_refs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credential_refs_via_connection ON gigalibs_analytics.connector_credential_refs;
CREATE POLICY credential_refs_via_connection
  ON gigalibs_analytics.connector_credential_refs
  USING (
    EXISTS (
      SELECT 1 FROM gigalibs_analytics.source_connections sc
      WHERE sc.id = connection_id
        AND sc.tenant_id = current_setting('app.tenant_id', true)
    )
  );

-- ── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION gigalibs_analytics.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_source_connections_updated_at
  ON gigalibs_analytics.source_connections;
CREATE TRIGGER trg_source_connections_updated_at
  BEFORE UPDATE ON gigalibs_analytics.source_connections
  FOR EACH ROW EXECUTE FUNCTION gigalibs_analytics.set_updated_at();

-- ── schema_migrations ledger ─────────────────────────────────
INSERT INTO gigalibs_analytics.schema_migrations (version, description, applied_at)
VALUES (4, 'connector_hub_source_connections', now())
ON CONFLICT (version) DO NOTHING;
