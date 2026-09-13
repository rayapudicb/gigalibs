BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.rate_catalog_items CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.void_records CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.payment_records CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.billable_shifts CASCADE;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 4;

COMMIT;
