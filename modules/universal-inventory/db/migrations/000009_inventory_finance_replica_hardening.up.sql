-- WI-OI-120bp review B2/B3: forced RLS on Finance fiscal replica tables; monotonic state version on period rows.
BEGIN;

ALTER TABLE gigalibs_inventory.finance_period_replica_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.finance_period_replica_meta FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_period_replica_meta_tenant_isolation ON gigalibs_inventory.finance_period_replica_meta;
CREATE POLICY finance_period_replica_meta_tenant_isolation ON gigalibs_inventory.finance_period_replica_meta
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_inventory.finance_fiscal_period_replica ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.finance_fiscal_period_replica FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_fiscal_period_replica_tenant_isolation ON gigalibs_inventory.finance_fiscal_period_replica;
CREATE POLICY finance_fiscal_period_replica_tenant_isolation ON gigalibs_inventory.finance_fiscal_period_replica
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_inventory.finance_fiscal_period_replica
  ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 0;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (9, '000009_inventory_finance_replica_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
