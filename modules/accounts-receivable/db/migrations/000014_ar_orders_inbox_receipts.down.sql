BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.inbox_receipts CASCADE;

DELETE FROM gigalibs_ar.schema_migrations
WHERE version = 14;

COMMIT;
