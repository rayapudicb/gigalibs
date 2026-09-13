-- Phase 2: Drop the foundation-tax CHECK constraints that locked tax_minor = 0.
-- This unblocks the invoice editor from accepting non-zero tax values.
-- Applied ONLY after the billing entity + series settings slice is deployed.

BEGIN;

ALTER TABLE gigalibs_ar.invoice_drafts
  DROP CONSTRAINT IF EXISTS invoice_drafts_foundation_tax_check;

ALTER TABLE gigalibs_ar.invoices
  DROP CONSTRAINT IF EXISTS invoices_foundation_tax_check;

COMMIT;
