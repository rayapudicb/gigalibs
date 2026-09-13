-- Reverse Phase 4 migration.
-- Removes only what migration 008 added; payment_records and void_records
-- tables (from migration 004) are left intact.

BEGIN;

DROP FUNCTION IF EXISTS gigalibs_ar.invoice_balance(uuid, uuid);
DROP INDEX IF EXISTS gigalibs_ar.void_records_invoice_lookup_idx;
DROP INDEX IF EXISTS gigalibs_ar.payment_records_balance_idx;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 8;

COMMIT;
