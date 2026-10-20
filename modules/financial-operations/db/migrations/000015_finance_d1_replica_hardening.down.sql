BEGIN;
DELETE FROM gigalibs_finance.schema_migrations WHERE version = 15;
DROP FUNCTION IF EXISTS gigalibs_finance.list_tenants_pending_inventory_fiscal_replica_snapshot();
COMMIT;
