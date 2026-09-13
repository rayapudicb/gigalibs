-- Reverse Phase 3 migration.

BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.invoice_deliveries;
DROP TABLE IF EXISTS gigalibs_ar.invoice_pdf_renders;
DROP FUNCTION IF EXISTS gigalibs_ar.reject_sent_delivery_change();

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 7;

COMMIT;
