BEGIN;
DELETE FROM gigalibs_iot.schema_migrations WHERE version = 2;
COMMIT;
