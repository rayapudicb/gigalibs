-- Reverse: re-add the foundation-tax CHECK constraints.
-- WARNING: will fail if any existing row has tax_minor != 0.

BEGIN;

ALTER TABLE gigalibs_ar.invoice_drafts
  ADD CONSTRAINT invoice_drafts_foundation_tax_check CHECK (tax_minor = 0);

ALTER TABLE gigalibs_ar.invoices
  ADD CONSTRAINT invoices_foundation_tax_check CHECK (tax_minor = 0);

COMMIT;
