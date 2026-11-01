-- WI-OI-131 B7: durable backfill cursors and producer vs Analytics fact-count reconciliation.
BEGIN;

CREATE TABLE gigalibs_analytics.module_source_backfill_cursors (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  cursor_token TEXT,
  batch_seq INTEGER NOT NULL DEFAULT 0 CHECK (batch_seq >= 0),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETE')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_key)
);

CREATE TABLE gigalibs_analytics.module_source_control_totals (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  producer_record_count BIGINT NOT NULL CHECK (producer_record_count >= 0),
  reported_at TIMESTAMPTZ NOT NULL,
  backfill_complete BOOLEAN NOT NULL DEFAULT false,
  backfill_cursor TEXT,
  backfill_batch_seq INTEGER CHECK (backfill_batch_seq IS NULL OR backfill_batch_seq >= 0),
  message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_key)
);

CREATE TABLE gigalibs_analytics.module_source_reconciliation (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  producer_record_count BIGINT,
  analytics_upsert_count BIGINT NOT NULL CHECK (analytics_upsert_count >= 0),
  analytics_reversal_count BIGINT NOT NULL CHECK (analytics_reversal_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('MATCH', 'UNDER', 'OVER', 'UNKNOWN')),
  PRIMARY KEY (tenant_id, source_key)
);

ALTER TABLE gigalibs_analytics.module_source_backfill_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_source_backfill_cursors FORCE ROW LEVEL SECURITY;
CREATE POLICY module_source_backfill_cursors_tenant ON gigalibs_analytics.module_source_backfill_cursors
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_analytics.module_source_control_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_source_control_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY module_source_control_totals_tenant ON gigalibs_analytics.module_source_control_totals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_analytics.module_source_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_source_reconciliation FORCE ROW LEVEL SECURITY;
CREATE POLICY module_source_reconciliation_tenant ON gigalibs_analytics.module_source_reconciliation
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (33, '000033_module_source_reconciliation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
