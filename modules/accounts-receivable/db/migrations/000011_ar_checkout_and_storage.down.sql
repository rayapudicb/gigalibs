-- Migration 000011 Down: AR Checkout Sessions, Payment Webhook Journal & PDF Storage Metadata
BEGIN;

DROP TABLE IF EXISTS gigalibs_ar.payment_webhook_events CASCADE;
DROP TABLE IF EXISTS gigalibs_ar.checkout_sessions CASCADE;

ALTER TABLE gigalibs_ar.invoice_pdf_renders
  DROP COLUMN IF EXISTS storage_key,
  DROP COLUMN IF EXISTS storage_provider;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 11;

COMMIT;
