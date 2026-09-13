BEGIN;

-- Reverse migration 000005

-- Drop customer_contacts table
DROP TABLE IF EXISTS gigalibs_ar.customer_contacts;

-- Remove columns added to billing_entities
ALTER TABLE gigalibs_ar.billing_entities
  DROP COLUMN IF EXISTS trading_name,
  DROP COLUMN IF EXISTS registration_number,
  DROP COLUMN IF EXISTS tax_id,
  DROP COLUMN IF EXISTS tax_id_type,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS email_reply_to,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS bank_details,
  DROP COLUMN IF EXISTS default_payment_terms_days,
  DROP COLUMN IF EXISTS late_fee_basis_points,
  DROP COLUMN IF EXISTS invoice_footer_text,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_by;

-- Restore billing_entities to INSERT-only (no UPDATE) for runtime role
REVOKE UPDATE ON TABLE gigalibs_ar.billing_entities FROM gigalibs_ar_api_runtime;

-- Remove columns added to customers
DROP INDEX IF EXISTS gigalibs_ar.customers_search_idx;
ALTER TABLE gigalibs_ar.customers
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS tax_id,
  DROP COLUMN IF EXISTS tax_id_type,
  DROP COLUMN IF EXISTS billing_address,
  DROP COLUMN IF EXISTS payment_terms_days,
  DROP COLUMN IF EXISTS credit_limit_minor,
  DROP COLUMN IF EXISTS notes;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 5;

COMMIT;
