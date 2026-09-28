-- Migration: 000001_data_studio_foundation
-- Universal Data Studio & Enterprise Data Contract Engine Schema

CREATE SCHEMA IF NOT EXISTS gigalibs_data_studio;

-- 1. Data Contracts (Master Envelope)
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.data_contracts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    contract_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    owner_team VARCHAR(64) NOT NULL,
    active_version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    compatibility_mode VARCHAR(32) NOT NULL DEFAULT 'BACKWARD',
    status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_code UNIQUE (tenant_id, contract_code)
);

-- 2. Contract Versions (Immutable JSONSchema specifications)
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.contract_versions (
    id VARCHAR(64) PRIMARY KEY,
    contract_id VARCHAR(64) REFERENCES gigalibs_data_studio.data_contracts(id) ON DELETE CASCADE,
    version VARCHAR(16) NOT NULL,
    json_schema JSONB NOT NULL,
    schema_format VARCHAR(32) NOT NULL DEFAULT 'JSONSCHEMA_DRAFT_07',
    change_summary TEXT NOT NULL,
    is_breaking_change BOOLEAN NOT NULL DEFAULT FALSE,
    published_by VARCHAR(64) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_version UNIQUE (contract_id, version)
);

-- 3. Declarative Field Mappings & Transformations
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.field_mappings (
    id VARCHAR(64) PRIMARY KEY,
    contract_id VARCHAR(64) REFERENCES gigalibs_data_studio.data_contracts(id) ON DELETE CASCADE,
    mapping_name VARCHAR(128) NOT NULL,
    source_system VARCHAR(64) NOT NULL,
    mapping_rules JSONB NOT NULL,
    currency_normalization BOOLEAN NOT NULL DEFAULT TRUE,
    target_currency VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Data Quality Assertions & SLA Constraints
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.quality_assertions (
    id VARCHAR(64) PRIMARY KEY,
    contract_id VARCHAR(64) REFERENCES gigalibs_data_studio.data_contracts(id) ON DELETE CASCADE,
    rule_name VARCHAR(128) NOT NULL,
    field_path VARCHAR(128) NOT NULL,
    assertion_type VARCHAR(64) NOT NULL,
    parameters JSONB NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'ERROR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Schema Drift & Violation Audit Logs
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.schema_drift_logs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    contract_id VARCHAR(64) REFERENCES gigalibs_data_studio.data_contracts(id),
    drift_type VARCHAR(64) NOT NULL,
    details JSONB NOT NULL,
    source_ip VARCHAR(64),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Audit Events
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high throughput lookups
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON gigalibs_data_studio.data_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_domain ON gigalibs_data_studio.data_contracts(domain);
CREATE INDEX IF NOT EXISTS idx_contract_versions_contract ON gigalibs_data_studio.contract_versions(contract_id);
CREATE INDEX IF NOT EXISTS idx_field_mappings_contract ON gigalibs_data_studio.field_mappings(contract_id);
CREATE INDEX IF NOT EXISTS idx_quality_assertions_contract ON gigalibs_data_studio.quality_assertions(contract_id);
CREATE INDEX IF NOT EXISTS idx_schema_drift_tenant ON gigalibs_data_studio.schema_drift_logs(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON gigalibs_data_studio.audit_events(tenant_id, created_at DESC);
