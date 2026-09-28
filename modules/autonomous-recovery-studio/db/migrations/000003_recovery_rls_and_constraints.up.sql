BEGIN;

-- 1. Schema migrations ledger
CREATE TABLE IF NOT EXISTS gigalibs_recovery.schema_migrations (
  version     INT          PRIMARY KEY,
  description TEXT         NOT NULL,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Back-fill: set a placeholder for any NULL tenant_id rows so we can
--    enforce NOT NULL. Tables should be empty; this is a safety guard only.
UPDATE gigalibs_recovery.detected_leaks           SET tenant_id = 'SYSTEM_PLACEHOLDER' WHERE tenant_id IS NULL;
UPDATE gigalibs_recovery.recovery_claims          SET tenant_id = 'SYSTEM_PLACEHOLDER' WHERE tenant_id IS NULL;
UPDATE gigalibs_recovery.historical_scan_sessions SET tenant_id = 'SYSTEM_PLACEHOLDER' WHERE tenant_id IS NULL;
UPDATE gigalibs_recovery.audit_events             SET tenant_id = 'SYSTEM_PLACEHOLDER' WHERE tenant_id IS NULL;

-- 3. Enforce NOT NULL on tenant_id columns
ALTER TABLE gigalibs_recovery.detected_leaks           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gigalibs_recovery.recovery_claims          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gigalibs_recovery.historical_scan_sessions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gigalibs_recovery.audit_events             ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Enable Row-Level Security on all tenant tables
ALTER TABLE gigalibs_recovery.detected_leaks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_recovery.recovery_claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_recovery.historical_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_recovery.audit_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_recovery.reconciliation_receipts ENABLE ROW LEVEL SECURITY;

-- 5. RESTRICTIVE tenant isolation policies
--    Uses VARCHAR(64) string equality consistent with existing schema design.
CREATE POLICY recovery_tenant_isolation_detected_leaks
  ON gigalibs_recovery.detected_leaks
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY recovery_tenant_isolation_recovery_claims
  ON gigalibs_recovery.recovery_claims
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY recovery_tenant_isolation_scan_sessions
  ON gigalibs_recovery.historical_scan_sessions
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY recovery_tenant_isolation_audit_events
  ON gigalibs_recovery.audit_events
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY recovery_tenant_isolation_reconciliation_receipts
  ON gigalibs_recovery.reconciliation_receipts
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

-- 6. Ensure the gigalibs_recovery role exists and has appropriate access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_recovery') THEN
    CREATE ROLE gigalibs_recovery NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA gigalibs_recovery TO gigalibs_recovery;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_recovery TO gigalibs_recovery;

-- 7. Record ledger versions for all three applied migrations
INSERT INTO gigalibs_recovery.schema_migrations (version, description, applied_at)
VALUES
  (1, 'Recovery schema foundation: detected_leaks, recovery_claims, historical_scan_sessions, audit_events', NOW()),
  (2, 'Multi-tenant isolation: tenant_id columns, reconciliation_receipts, tenant_recovery_configs, indexes', NOW()),
  (3, 'RLS policies, NOT NULL tenant_id constraints, schema_migrations ledger', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
