-- Forward migration: multi-tenant cryptographic e-signature, envelopes, recipients, audit events, and reconciliation receipts
CREATE SCHEMA IF NOT EXISTS gigalibs_esign;

-- 1. Tenant E-Signature Configurations
CREATE TABLE IF NOT EXISTS gigalibs_esign.tenant_esign_configs (
  tenant_id VARCHAR(64) PRIMARY KEY,
  ca_organization VARCHAR(128) NOT NULL DEFAULT 'GigaLibs Enterprise Root CA',
  fips_compliance_mode BOOLEAN NOT NULL DEFAULT TRUE,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. E-Signature Envelopes
CREATE TABLE IF NOT EXISTS gigalibs_esign.esign_envelopes (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  title VARCHAR(256) NOT NULL,
  document_number VARCHAR(64) NOT NULL,
  source_module VARCHAR(64) NOT NULL DEFAULT 'ACCOUNTS_RECEIVABLE',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  document_sha256 VARCHAR(64) NOT NULL,
  payload_text TEXT NOT NULL,
  certificate_x509 TEXT,
  pki_serial_number VARCHAR(128),
  pki_issuer VARCHAR(256),
  pki_subject VARCHAR(256),
  pki_thumbprint VARCHAR(128),
  algorithm VARCHAR(64) NOT NULL DEFAULT 'SHA-256 / RSA-4096 (FIPS 186-4)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. E-Signature Recipients
CREATE TABLE IF NOT EXISTS gigalibs_esign.esign_recipients (
  id VARCHAR(64) PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL REFERENCES gigalibs_esign.esign_envelopes(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(256) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'SIGNER',
  routing_order INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_block VARCHAR(128),
  signature_digest VARCHAR(64),
  ip_address VARCHAR(45)
);

-- 4. E-Signature Immutable Audit Events
CREATE TABLE IF NOT EXISTS gigalibs_esign.esign_audit_events (
  id VARCHAR(64) PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL REFERENCES gigalibs_esign.esign_envelopes(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_name VARCHAR(128) NOT NULL,
  actor_email VARCHAR(256) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  chain_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Provider Evidence & Reconciliation Receipts
CREATE TABLE IF NOT EXISTS gigalibs_esign.esign_reconciliation_receipts (
  id VARCHAR(64) PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL REFERENCES gigalibs_esign.esign_envelopes(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL,
  reconciliation_type VARCHAR(64) NOT NULL DEFAULT 'PKI_COMPLETION_SEAL',
  provider_proof_hash VARCHAR(64) NOT NULL,
  court_admissible_token VARCHAR(128) NOT NULL,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- 6. Indexes for Performance and Isolation
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_tenant ON gigalibs_esign.esign_envelopes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_tenant_status ON gigalibs_esign.esign_envelopes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_esign_recipients_envelope ON gigalibs_esign.esign_recipients(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_envelope ON gigalibs_esign.esign_audit_events(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_receipts_envelope ON gigalibs_esign.esign_reconciliation_receipts(envelope_id);
