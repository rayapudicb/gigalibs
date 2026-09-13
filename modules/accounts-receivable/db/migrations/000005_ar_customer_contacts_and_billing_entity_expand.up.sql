BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 000005: Customer master expansion + billing entity branding
--
-- Adds:
--   • customers: billing_address, phone, website, tax_id, tax_id_type,
--                payment_terms_days, notes, credit_limit_minor
--   • customer_contacts table (billing contacts per customer)
--   • billing_entities: trading_name, address (jsonb), logo_url, bank_details (jsonb),
--                        late_fee_basis_points, default_payment_terms_days, email_reply_to
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand customers table ──────────────────────────────────────────────

ALTER TABLE gigalibs_ar.customers
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS tax_id            text,
  ADD COLUMN IF NOT EXISTS tax_id_type       text,
  ADD COLUMN IF NOT EXISTS billing_address   jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms_days smallint,
  ADD COLUMN IF NOT EXISTS credit_limit_minor bigint,
  ADD COLUMN IF NOT EXISTS notes             text;

ALTER TABLE gigalibs_ar.customers
  ADD CONSTRAINT customers_phone_check CHECK (
    phone IS NULL OR char_length(btrim(phone)) BETWEEN 1 AND 50
  ),
  ADD CONSTRAINT customers_website_check CHECK (
    website IS NULL OR char_length(website) BETWEEN 1 AND 255
  ),
  ADD CONSTRAINT customers_tax_id_check CHECK (
    tax_id IS NULL OR char_length(btrim(tax_id)) BETWEEN 1 AND 50
  ),
  ADD CONSTRAINT customers_tax_id_type_check CHECK (
    tax_id_type IS NULL OR
    tax_id_type IN ('VAT', 'GST', 'EIN', 'ABN', 'GSTIN', 'OTHER')
  ),
  ADD CONSTRAINT customers_billing_address_check CHECK (
    billing_address IS NULL OR jsonb_typeof(billing_address) = 'object'
  ),
  ADD CONSTRAINT customers_payment_terms_check CHECK (
    payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365
  ),
  ADD CONSTRAINT customers_credit_limit_check CHECK (
    credit_limit_minor IS NULL OR credit_limit_minor >= 0
  ),
  ADD CONSTRAINT customers_notes_check CHECK (
    notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000
  );

-- Full-text search index on customer list
CREATE INDEX IF NOT EXISTS customers_search_idx
  ON gigalibs_ar.customers
  USING gin(
    to_tsvector(
      'simple',
      coalesce(legal_name, '') || ' ' || coalesce(billing_email, '')
    )
  );

-- ── 2. customer_contacts table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigalibs_ar.customer_contacts (
  tenant_id   uuid    NOT NULL,
  id          uuid    NOT NULL,
  customer_id uuid    NOT NULL,
  name        text    NOT NULL,
  email       text    NOT NULL,
  phone       text,
  role        text    NOT NULL DEFAULT 'BILLING',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at  timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT customer_contacts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT customer_contacts_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES gigalibs_ar.customers (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT customer_contacts_name_check CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 200
  ),
  CONSTRAINT customer_contacts_email_check CHECK (
    char_length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1
  ),
  CONSTRAINT customer_contacts_phone_check CHECK (
    phone IS NULL OR char_length(btrim(phone)) BETWEEN 1 AND 50
  ),
  CONSTRAINT customer_contacts_role_check CHECK (
    role IN ('BILLING', 'PRIMARY', 'CC', 'TECHNICAL', 'ACCOUNTS_PAYABLE')
  )
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
  ON gigalibs_ar.customer_contacts (tenant_id, customer_id, is_active, role);

-- RLS for customer_contacts
ALTER TABLE gigalibs_ar.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.customer_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_contacts_tenant_policy ON gigalibs_ar.customer_contacts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ── 3. Expand billing_entities ─────────────────────────────────────────────

ALTER TABLE gigalibs_ar.billing_entities
  ADD COLUMN IF NOT EXISTS trading_name              text,
  ADD COLUMN IF NOT EXISTS registration_number       text,
  ADD COLUMN IF NOT EXISTS tax_id                    text,
  ADD COLUMN IF NOT EXISTS tax_id_type               text,
  ADD COLUMN IF NOT EXISTS address                   jsonb,
  ADD COLUMN IF NOT EXISTS phone                     text,
  ADD COLUMN IF NOT EXISTS email                     text,
  ADD COLUMN IF NOT EXISTS email_reply_to            text,
  ADD COLUMN IF NOT EXISTS website                   text,
  ADD COLUMN IF NOT EXISTS logo_url                  text,
  ADD COLUMN IF NOT EXISTS bank_details              jsonb,
  ADD COLUMN IF NOT EXISTS default_payment_terms_days smallint NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS late_fee_basis_points     integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_footer_text       text,
  ADD COLUMN IF NOT EXISTS created_by                text,
  ADD COLUMN IF NOT EXISTS updated_by                text;

ALTER TABLE gigalibs_ar.billing_entities
  ADD CONSTRAINT billing_entities_trading_name_check CHECK (
    trading_name IS NULL OR char_length(btrim(trading_name)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT billing_entities_tax_id_type_check CHECK (
    tax_id_type IS NULL OR
    tax_id_type IN ('VAT', 'GST', 'EIN', 'ABN', 'GSTIN', 'OTHER')
  ),
  ADD CONSTRAINT billing_entities_address_check CHECK (
    address IS NULL OR jsonb_typeof(address) = 'object'
  ),
  ADD CONSTRAINT billing_entities_bank_details_check CHECK (
    bank_details IS NULL OR jsonb_typeof(bank_details) = 'object'
  ),
  ADD CONSTRAINT billing_entities_payment_terms_check CHECK (
    default_payment_terms_days BETWEEN 0 AND 365
  ),
  ADD CONSTRAINT billing_entities_late_fee_check CHECK (
    late_fee_basis_points BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT billing_entities_footer_check CHECK (
    invoice_footer_text IS NULL OR char_length(invoice_footer_text) BETWEEN 1 AND 1000
  );

-- ── 4. Grant runtime permissions for new tables / columns ──────────────────

-- billing_entities already has SELECT, INSERT — update is needed now for setup
GRANT SELECT, INSERT, UPDATE ON TABLE gigalibs_ar.billing_entities
  TO gigalibs_ar_api_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gigalibs_ar.customer_contacts
  TO gigalibs_ar_api_runtime;

-- ── 5. Record migration ────────────────────────────────────────────────────

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (5, '000005_ar_customer_contacts_and_billing_entity_expand')
ON CONFLICT (version) DO NOTHING;

COMMIT;
