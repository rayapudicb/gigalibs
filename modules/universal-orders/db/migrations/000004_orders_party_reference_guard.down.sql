BEGIN;

DROP FUNCTION IF EXISTS gigalibs_orders.require_active_party(varchar, uuid);

DELETE FROM gigalibs_orders.schema_migrations WHERE version = 4;

COMMIT;
