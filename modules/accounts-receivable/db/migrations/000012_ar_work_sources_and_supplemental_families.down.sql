-- Migration 000012 Down: AR Work Sources, Billable Source Records & Supplemental Invoice Families
BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.invoice_families CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.billable_source_records CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.work_sources CASCADE;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 12;

COMMIT;
