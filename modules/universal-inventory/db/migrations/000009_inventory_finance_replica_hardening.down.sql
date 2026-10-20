BEGIN;
ALTER TABLE gigalibs_inventory.finance_fiscal_period_replica DROP COLUMN IF EXISTS state_version;
DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 9;
COMMIT;
