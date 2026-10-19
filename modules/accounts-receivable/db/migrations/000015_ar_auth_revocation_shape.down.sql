BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.auth_revocation_events;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 15;

COMMIT;
