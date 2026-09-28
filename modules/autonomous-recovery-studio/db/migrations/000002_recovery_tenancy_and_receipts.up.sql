-- Forward migration: multi-tenant isolation, tenant configuration, and reconciliation receipts
CREATE SCHEMA IF NOT EXISTS gigalibs_recovery;

-- 1. Tenant Recovery Configurations
CREATE TABLE IF NOT EXISTS gigalibs_recovery.tenant_recovery_configs (
  tenant_id VARCHAR(64) PRIMARY KEY,
  scanner_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_hold_confidence_threshold NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
  sla_guarantee_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add tenant_id to detected_leaks if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'gigalibs_recovery' AND table_name = 'detected_leaks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gigalibs_recovery.detected_leaks ADD COLUMN tenant_id VARCHAR(64);
  END IF;
END $$;

-- 3. Add tenant_id to recovery_claims if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'gigalibs_recovery' AND table_name = 'recovery_claims' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gigalibs_recovery.recovery_claims ADD COLUMN tenant_id VARCHAR(64);
  END IF;
END $$;

-- 4. Add tenant_id to historical_scan_sessions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'gigalibs_recovery' AND table_name = 'historical_scan_sessions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gigalibs_recovery.historical_scan_sessions ADD COLUMN tenant_id VARCHAR(64);
  END IF;
END $$;

-- 5. Add tenant_id to audit_events if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'gigalibs_recovery' AND table_name = 'audit_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gigalibs_recovery.audit_events ADD COLUMN tenant_id VARCHAR(64);
  END IF;
END $$;

-- 6. Create Reconciliation Receipts Table
CREATE TABLE IF NOT EXISTS gigalibs_recovery.reconciliation_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  leak_id VARCHAR(64) NOT NULL REFERENCES gigalibs_recovery.detected_leaks(id) ON DELETE CASCADE,
  claim_id VARCHAR(64),
  receipt_type VARCHAR(64) NOT NULL,
  amount_usd NUMERIC(15, 2) NOT NULL,
  evidence_hash VARCHAR(64) NOT NULL,
  actor_subject VARCHAR(128) NOT NULL,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- 7. Indexes for Tenant Isolation and Performance
CREATE INDEX IF NOT EXISTS idx_recovery_leaks_tenant ON gigalibs_recovery.detected_leaks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_leaks_tenant_status ON gigalibs_recovery.detected_leaks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_recovery_leaks_tenant_type ON gigalibs_recovery.detected_leaks(tenant_id, leak_type);
CREATE INDEX IF NOT EXISTS idx_recovery_claims_tenant ON gigalibs_recovery.recovery_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_scans_tenant ON gigalibs_recovery.historical_scan_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_audit_tenant ON gigalibs_recovery.audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_receipts_tenant ON gigalibs_recovery.reconciliation_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_receipts_leak ON gigalibs_recovery.reconciliation_receipts(leak_id);
