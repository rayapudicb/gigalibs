-- WI-OI-129 S4: idempotent project billing → invoice linkage.
BEGIN;

ALTER TABLE gigalibs_ar.invoices
  ADD COLUMN source_project_billing_id uuid;

CREATE UNIQUE INDEX invoices_source_project_billing_unique
  ON gigalibs_ar.invoices (tenant_id, source_project_billing_id)
  WHERE source_project_billing_id IS NOT NULL;

INSERT INTO gigalibs_ar.schema_migrations (version) VALUES (19);
COMMIT;
