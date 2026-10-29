BEGIN;
DROP TABLE IF EXISTS gigalibs_cmms.asset_downtimes;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 23;
COMMIT;
