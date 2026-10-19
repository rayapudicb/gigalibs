BEGIN;
DROP TABLE IF EXISTS gigalibs_ar.record_idempotency;
DELETE FROM gigalibs_ar.schema_migrations WHERE version = 16;
COMMIT;
