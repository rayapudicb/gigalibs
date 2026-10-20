-- WI-OI-120bq (H2, H3, M3): inbox raw body, per-product standard costs, posting cutoff store, retry audit.
BEGIN;

ALTER TABLE gigalibs_finance.inbox_receipts
  ADD COLUMN IF NOT EXISTS raw_body TEXT,
  ADD COLUMN IF NOT EXISTS posting_date DATE;

CREATE TABLE IF NOT EXISTS gigalibs_finance.product_standard_costs (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  cost_profile_id UUID NOT NULL REFERENCES gigalibs_finance.cost_profiles(id),
  product_id UUID NOT NULL,
  standard_unit_cost_scaled BIGINT NOT NULL CHECK (standard_unit_cost_scaled > 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  change_reason TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  CONSTRAINT uq_product_standard_costs_effective
    UNIQUE (tenant_id, cost_profile_id, product_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_product_standard_costs_lookup
  ON gigalibs_finance.product_standard_costs (tenant_id, cost_profile_id, product_id, effective_from DESC);

ALTER TABLE gigalibs_finance.product_standard_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.product_standard_costs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.product_standard_costs
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS gigalibs_finance.inventory_posting_cutoff_confirmations (
  tenant_id VARCHAR(64) NOT NULL,
  accounting_book_id UUID NOT NULL,
  fiscal_period_id UUID NOT NULL,
  period_end DATE NOT NULL,
  undelivered_receipt_count INTEGER NOT NULL CHECK (undelivered_receipt_count >= 0),
  source_message_id VARCHAR(128) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fiscal_period_id)
);

CREATE TABLE IF NOT EXISTS gigalibs_finance.subledger_posting_retries (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subledger_posting_retries_tenant_message
  ON gigalibs_finance.subledger_posting_retries (tenant_id, message_id, created_at DESC);

ALTER TABLE gigalibs_finance.inventory_posting_cutoff_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.inventory_posting_cutoff_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.inventory_posting_cutoff_confirmations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.subledger_posting_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.subledger_posting_retries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.subledger_posting_retries
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (14)
ON CONFLICT (version) DO NOTHING;

COMMIT;
