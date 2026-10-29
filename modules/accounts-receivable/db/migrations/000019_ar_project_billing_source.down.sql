BEGIN;
DROP INDEX IF EXISTS gigalibs_ar.invoices_source_project_billing_unique;
ALTER TABLE gigalibs_ar.invoices DROP COLUMN IF EXISTS source_project_billing_id;
DELETE FROM gigalibs_ar.schema_migrations WHERE version = 19;
COMMIT;
