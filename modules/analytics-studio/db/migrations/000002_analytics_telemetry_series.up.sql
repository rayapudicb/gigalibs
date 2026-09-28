-- Migration: 000002_analytics_telemetry_series
-- Multi-tenant dynamic telemetry series with tamper-evident cryptographic hash

CREATE TABLE IF NOT EXISTS gigalibs_analytics.telemetry_series (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  chart_id VARCHAR(64) NOT NULL,
  sector_id VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL,
  subtitle VARCHAR(256),
  chart_type VARCHAR(32) NOT NULL,
  family VARCHAR(32) NOT NULL,
  category VARCHAR(32) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  dimensions JSONB NOT NULL DEFAULT '[]',
  tags JSONB NOT NULL DEFAULT '[]',
  payload JSONB NOT NULL DEFAULT '{}',
  source_table VARCHAR(128) NOT NULL DEFAULT 'gigalibs_analytics.telemetry_series',
  lineage_sha256 VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_chart UNIQUE (tenant_id, chart_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_series_tenant_sector ON gigalibs_analytics.telemetry_series(tenant_id, sector_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_series_tenant_chart ON gigalibs_analytics.telemetry_series(tenant_id, chart_id);
