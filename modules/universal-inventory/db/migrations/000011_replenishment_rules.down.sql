BEGIN;

DROP TABLE IF EXISTS gigalibs_inventory.replenish_rules;

DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 11;

COMMIT;
