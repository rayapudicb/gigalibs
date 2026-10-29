BEGIN;
DROP TABLE IF EXISTS gigalibs_iot.auth_revocation_events;
DELETE FROM gigalibs_iot.schema_migrations WHERE version = 3;
COMMIT;
