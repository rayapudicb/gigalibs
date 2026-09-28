-- Universal Enterprise Connector Hub PostgreSQL 16 Schema Foundation
CREATE SCHEMA IF NOT EXISTS gigalibs_connectors;

-- 1. Connector Definitions (Enterprise Integration Catalog)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.connector_definitions (
    id VARCHAR(64) PRIMARY KEY,
    connector_code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL, -- CRM, PROCUREMENT, BANKING, ERP, GENERIC
    description TEXT,
    icon VARCHAR(64),
    auth_types JSONB NOT NULL DEFAULT '["WEBHOOK", "OAUTH2"]'::jsonb,
    supported_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tenant Connections (Active tenant-scoped integration instances)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.tenant_connections (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    connector_code VARCHAR(64) NOT NULL REFERENCES gigalibs_connectors.connector_definitions(connector_code),
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) NOT NULL,
    environment VARCHAR(32) NOT NULL DEFAULT 'PRODUCTION', -- PRODUCTION, SANDBOX, TEST
    auth_type VARCHAR(32) NOT NULL DEFAULT 'WEBHOOK',
    webhook_secret VARCHAR(256),
    target_workflow_code VARCHAR(64),
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'READY', -- READY, SYNCING, ERROR, DISABLED
    last_sync_at TIMESTAMPTZ,
    events_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_conn_slug UNIQUE (tenant_id, slug)
);

-- 3. Connector Credentials (Vault-referenced encrypted credentials)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.connector_credentials (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    connection_id VARCHAR(64) NOT NULL REFERENCES gigalibs_connectors.tenant_connections(id) ON DELETE CASCADE,
    credential_type VARCHAR(64) NOT NULL, -- API_KEY, OAUTH2_TOKENS, SIGNING_SECRET, MTLS_CERT
    encrypted_data TEXT NOT NULL,
    key_reference VARCHAR(128) NOT NULL DEFAULT 'master-kms-key-01',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Raw Ingestion Journal (Append-only immutable archive with SHA-256 and idempotency)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.raw_ingestion_journal (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    connection_id VARCHAR(64) NOT NULL REFERENCES gigalibs_connectors.tenant_connections(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload_sha256 VARCHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_ip VARCHAR(45) NOT NULL DEFAULT 'unknown',
    status VARCHAR(32) NOT NULL DEFAULT 'INGESTED', -- INGESTED, DISPATCHED, FAILED, DUPLICATE
    dispatched_run_id VARCHAR(64),
    duration_ms INT NOT NULL DEFAULT 0,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_ingest_idemp UNIQUE (tenant_id, idempotency_key)
);

-- 5. Sync Jobs (Polling and batch synchronization jobs)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.sync_jobs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    connection_id VARCHAR(64) NOT NULL REFERENCES gigalibs_connectors.tenant_connections(id) ON DELETE CASCADE,
    job_type VARCHAR(32) NOT NULL DEFAULT 'MANUAL', -- MANUAL, SCHEDULED, WEBHOOK_BURST
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED', -- RUNNING, COMPLETED, FAILED
    records_ingested INT NOT NULL DEFAULT 0,
    cursor_after VARCHAR(256),
    duration_ms INT NOT NULL DEFAULT 0,
    error_details JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 6. Audit Events (Regulatory SOX audit ledger)
CREATE TABLE IF NOT EXISTS gigalibs_connectors.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conn_tenant ON gigalibs_connectors.tenant_connections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conn_slug ON gigalibs_connectors.tenant_connections (slug);
CREATE INDEX IF NOT EXISTS idx_journal_tenant ON gigalibs_connectors.raw_ingestion_journal (tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_idemp ON gigalibs_connectors.raw_ingestion_journal (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_journal_conn ON gigalibs_connectors.raw_ingestion_journal (connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_conn ON gigalibs_connectors.sync_jobs (connection_id);
