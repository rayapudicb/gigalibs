-- Forward migration: multi-tenant analytics, metric snapshots with cryptographic lineage, and executive actions
CREATE SCHEMA IF NOT EXISTS gigalibs_analytics;

-- 1. Tenant Analytics Configurations
CREATE TABLE IF NOT EXISTS gigalibs_analytics.tenant_analytics_configs (
  tenant_id VARCHAR(64) PRIMARY KEY,
  refresh_cadence_minutes INT NOT NULL DEFAULT 60,
  lineage_verification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Metric Snapshots with Tamper-Evident SHA-256 Lineage Hash
CREATE TABLE IF NOT EXISTS gigalibs_analytics.metric_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  metric_key VARCHAR(64) NOT NULL,
  domain VARCHAR(64) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  metric_value NUMERIC(18, 4) NOT NULL,
  previous_value NUMERIC(18, 4),
  delta_percentage NUMERIC(8, 2),
  source_table VARCHAR(128) NOT NULL,
  source_row_count INT NOT NULL,
  lineage_sha256 VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Executive Actions with Cryptographic Receipts
CREATE TABLE IF NOT EXISTS gigalibs_analytics.executive_actions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  target_domain VARCHAR(64) NOT NULL,
  target_entity VARCHAR(128) NOT NULL,
  actor_subject VARCHAR(128) NOT NULL,
  reason TEXT,
  impact_summary JSONB NOT NULL DEFAULT '{}',
  receipt_digest VARCHAR(64) NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for Tenant Isolation and Fast Retrieval
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_key ON gigalibs_analytics.metric_snapshots(tenant_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_domain ON gigalibs_analytics.metric_snapshots(tenant_id, domain);
CREATE INDEX IF NOT EXISTS idx_analytics_actions_tenant ON gigalibs_analytics.executive_actions(tenant_id);
