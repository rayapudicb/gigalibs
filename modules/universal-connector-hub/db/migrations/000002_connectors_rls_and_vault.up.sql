-- Migration 000002: Row Level Security, Migration Tracking, and Credential Vault for Connector Hub
-- Schema: gigalibs_connectors

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS gigalibs_connectors.schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Extend connector_credentials with encryption metadata and OAuth2 fields
ALTER TABLE gigalibs_connectors.connector_credentials
    ADD COLUMN IF NOT EXISTS iv VARCHAR(64),
    ADD COLUMN IF NOT EXISTS auth_tag VARCHAR(64),
    ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS code_verifier_hash VARCHAR(128);

-- 3. Extend raw_ingestion_journal with dispatch retry tracking
ALTER TABLE gigalibs_connectors.raw_ingestion_journal
    ADD COLUMN IF NOT EXISTS dispatch_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_dispatch_error TEXT;

-- 4. Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE gigalibs_connectors.tenant_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.raw_ingestion_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_connectors.audit_events ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_connections ON gigalibs_connectors.tenant_connections;
CREATE POLICY tenant_isolation_connections ON gigalibs_connectors.tenant_connections
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_credentials ON gigalibs_connectors.connector_credentials;
CREATE POLICY tenant_isolation_credentials ON gigalibs_connectors.connector_credentials
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_journal ON gigalibs_connectors.raw_ingestion_journal;
CREATE POLICY tenant_isolation_journal ON gigalibs_connectors.raw_ingestion_journal
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_sync ON gigalibs_connectors.sync_jobs;
CREATE POLICY tenant_isolation_sync ON gigalibs_connectors.sync_jobs
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_audit ON gigalibs_connectors.audit_events;
CREATE POLICY tenant_isolation_audit ON gigalibs_connectors.audit_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 6. Record applied migrations
INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES 
    (1, '000001_connectors_foundation', NOW()),
    (2, '000002_connectors_rls_and_vault', NOW())
ON CONFLICT (version) DO NOTHING;
