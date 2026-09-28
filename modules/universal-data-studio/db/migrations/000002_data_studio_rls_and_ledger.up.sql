-- Migration 000002: Row Level Security, Migration Tracking, and Currency Traceability for Data Studio
-- Schema: gigalibs_data_studio

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Extend field_mappings with exchange rate micros and timestamp for conversion proof
ALTER TABLE gigalibs_data_studio.field_mappings
    ADD COLUMN IF NOT EXISTS exchange_rate_micros BIGINT,
    ADD COLUMN IF NOT EXISTS rate_timestamp TIMESTAMPTZ;

-- 3. Extend data_contracts with tenant-scoped parent and deprecation metadata
ALTER TABLE gigalibs_data_studio.data_contracts
    ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;

-- 4. Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE gigalibs_data_studio.data_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_data_studio.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_data_studio.quality_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_data_studio.schema_drift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_data_studio.audit_events ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_contracts ON gigalibs_data_studio.data_contracts;
CREATE POLICY tenant_isolation_contracts ON gigalibs_data_studio.data_contracts
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_drift ON gigalibs_data_studio.schema_drift_logs;
CREATE POLICY tenant_isolation_drift ON gigalibs_data_studio.schema_drift_logs
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_audit ON gigalibs_data_studio.audit_events;
CREATE POLICY tenant_isolation_audit ON gigalibs_data_studio.audit_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 6. Record applied migrations
INSERT INTO gigalibs_data_studio.schema_migrations (version, name, applied_at)
VALUES 
    (1, '000001_data_studio_foundation', NOW()),
    (2, '000002_data_studio_rls_and_ledger', NOW())
ON CONFLICT (version) DO NOTHING;
