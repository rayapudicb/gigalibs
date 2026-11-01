-- WI-OI-131 B6: idempotent module fact receipts keyed by (tenant_id, source_key, event_id).
BEGIN;

CREATE TABLE gigalibs_analytics.module_fact_receipts (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES gigalibs_analytics.source_connections (id) ON DELETE RESTRICT,
  raw_record_version_id UUID NOT NULL REFERENCES gigalibs_analytics.raw_record_versions (id) ON DELETE RESTRICT,
  fact_kind TEXT NOT NULL CHECK (fact_kind IN ('UPSERT', 'REVERSAL')),
  data_origin TEXT NOT NULL CHECK (data_origin IN ('PRODUCTION', 'TEST')),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_key, event_id)
);

CREATE TABLE gigalibs_analytics.module_fact_rejected (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 64),
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  envelope JSONB NOT NULL,
  PRIMARY KEY (tenant_id, source_key, event_id)
);

ALTER TABLE gigalibs_analytics.module_fact_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_fact_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY module_fact_receipts_tenant_isolation ON gigalibs_analytics.module_fact_receipts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_analytics.module_fact_rejected ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_fact_rejected FORCE ROW LEVEL SECURITY;
CREATE POLICY module_fact_rejected_tenant_isolation ON gigalibs_analytics.module_fact_rejected
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE INDEX module_fact_receipts_connection ON gigalibs_analytics.module_fact_receipts (connection_id);

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (32, '000032_module_fact_receipts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
