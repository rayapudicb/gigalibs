BEGIN;
DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 7;
COMMIT;
