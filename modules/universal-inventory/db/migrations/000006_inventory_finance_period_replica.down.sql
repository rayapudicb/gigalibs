BEGIN;
DROP TABLE IF EXISTS gigalibs_inventory.finance_fiscal_period_replica;
DROP TABLE IF EXISTS gigalibs_inventory.finance_period_replica_meta;
DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 6;
COMMIT;
