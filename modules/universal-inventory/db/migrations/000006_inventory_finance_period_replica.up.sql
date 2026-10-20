-- WI-OI-120bp (D1): local Finance fiscal calendar replica for receipt completion guards.
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_inventory.finance_period_replica_meta (
  tenant_id VARCHAR(64) PRIMARY KEY,
  primary_book_id UUID,
  initial_sync_completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gigalibs_inventory.finance_fiscal_period_replica (
  tenant_id VARCHAR(64) NOT NULL,
  fiscal_period_id UUID NOT NULL,
  accounting_book_id UUID NOT NULL,
  period_name VARCHAR(128) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fiscal_period_id)
);

CREATE INDEX IF NOT EXISTS finance_fiscal_period_replica_lookup
  ON gigalibs_inventory.finance_fiscal_period_replica (tenant_id, accounting_book_id, start_date, end_date);

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (6, '000006_inventory_finance_period_replica')
ON CONFLICT (version) DO NOTHING;

COMMIT;
