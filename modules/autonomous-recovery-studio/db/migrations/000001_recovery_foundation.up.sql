CREATE SCHEMA IF NOT EXISTS gigalibs_recovery;

CREATE TABLE IF NOT EXISTS gigalibs_recovery.detected_leaks (
  id VARCHAR(64) PRIMARY KEY,
  leak_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_id VARCHAR(64) NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount_usd NUMERIC(15, 2) NOT NULL,
  confidence_score NUMERIC(5, 2) NOT NULL,
  accuracy_protocol VARCHAR(64) NOT NULL DEFAULT 'DETERMINISTIC_DUAL_GATE',
  primary_doc_id VARCHAR(64) NOT NULL,
  primary_doc_date TIMESTAMPTZ NOT NULL,
  comparison_doc_id VARCHAR(64),
  comparison_doc_date TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'DETECTED',
  action_taken VARCHAR(64),
  action_notes TEXT,
  clawback_run_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gigalibs_recovery.recovery_claims (
  id VARCHAR(64) PRIMARY KEY,
  leak_id VARCHAR(64) NOT NULL REFERENCES gigalibs_recovery.detected_leaks(id),
  claim_number VARCHAR(64) NOT NULL UNIQUE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_contact_email VARCHAR(255) NOT NULL,
  claim_amount_usd NUMERIC(15, 2) NOT NULL,
  settlement_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
  evidence_hash VARCHAR(64) NOT NULL,
  workflow_run_id VARCHAR(64),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gigalibs_recovery.historical_scan_sessions (
  id VARCHAR(64) PRIMARY KEY,
  scan_name VARCHAR(255) NOT NULL,
  records_scanned INT NOT NULL,
  leaks_found INT NOT NULL,
  potential_recovery_usd NUMERIC(15, 2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  duration_ms INT NOT NULL,
  scanned_by VARCHAR(128) NOT NULL DEFAULT 'AUTONOMOUS_SHADOW_ENGINE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gigalibs_recovery.audit_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  performed_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_leaks_status ON gigalibs_recovery.detected_leaks(status);
CREATE INDEX IF NOT EXISTS idx_recovery_leaks_type ON gigalibs_recovery.detected_leaks(leak_type);
CREATE INDEX IF NOT EXISTS idx_recovery_leaks_vendor ON gigalibs_recovery.detected_leaks(vendor_id);
CREATE INDEX IF NOT EXISTS idx_recovery_claims_status ON gigalibs_recovery.recovery_claims(status);
