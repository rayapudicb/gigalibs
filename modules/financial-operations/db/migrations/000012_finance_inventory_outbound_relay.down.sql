BEGIN;
DROP FUNCTION IF EXISTS gigalibs_finance.relay_lease_finance_inventory_events(integer, integer);
DROP TABLE IF EXISTS gigalibs_finance.inventory_fiscal_replica_publish;
DELETE FROM gigalibs_finance.schema_migrations WHERE version = 12;
COMMIT;
