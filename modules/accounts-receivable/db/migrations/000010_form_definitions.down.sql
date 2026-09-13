BEGIN;

DROP INDEX IF EXISTS gigalibs_ar.customers_custom_fields_idx;
DROP INDEX IF EXISTS gigalibs_ar.invoice_drafts_custom_fields_idx;

ALTER TABLE gigalibs_ar.payment_records  DROP COLUMN IF EXISTS custom_fields;
ALTER TABLE gigalibs_ar.credit_notes     DROP COLUMN IF EXISTS custom_fields;
ALTER TABLE gigalibs_ar.customers        DROP COLUMN IF EXISTS custom_fields;
ALTER TABLE gigalibs_ar.invoice_drafts   DROP COLUMN IF EXISTS custom_fields;

DROP TABLE IF EXISTS gigalibs_ar.custom_field_definitions;
DROP TABLE IF EXISTS gigalibs_ar.form_definitions;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 10;

COMMIT;
