BEGIN;

CREATE ROLE gigalibs_ar_runtime_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT gigalibs_ar_api_runtime TO gigalibs_ar_runtime_test;

INSERT INTO gigalibs_ar.module_tenants (id, oidc_issuer, external_tenant_subject)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'https://identity.test.invalid', 'cert-tenant-a'),
  ('20000000-0000-4000-8000-000000000002', 'https://identity.test.invalid', 'cert-tenant-b');

SET ROLE gigalibs_ar_runtime_test;
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);

INSERT INTO gigalibs_ar.billing_entities (
  tenant_id, id, legal_name, default_currency, locale, time_zone
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000010',
  'Certification Tenant A',
  'USD',
  'en-US',
  'UTC'
);

INSERT INTO gigalibs_ar.invoice_series (
  tenant_id, id, billing_entity_id, code, prefix, next_value, padding
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000010',
  'PRIMARY',
  'CERT-',
  1,
  6
);

INSERT INTO gigalibs_ar.customers (
  tenant_id, id, legal_name, billing_email, currency, created_by, updated_by
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000020',
  'Certification Customer A',
  'billing-a@example.invalid',
  'USD',
  'certification-actor',
  'certification-actor'
);

INSERT INTO gigalibs_ar.invoice_drafts (
  tenant_id,
  id,
  billing_entity_id,
  invoice_series_id,
  customer_id,
  currency,
  issue_date,
  due_date,
  subtotal_minor,
  tax_minor,
  total_minor,
  created_by,
  updated_by
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000020',
  'USD',
  DATE '2026-09-04',
  DATE '2026-10-04',
  10000,
  0,
  10000,
  'certification-actor',
  'certification-actor'
);

INSERT INTO gigalibs_ar.invoice_draft_lines (
  tenant_id, id, draft_id, position, description, quantity, unit_amount_minor, amount_minor
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000030',
  1,
  'Certification service',
  1,
  10000,
  10000
);

INSERT INTO gigalibs_ar.invoices (
  tenant_id,
  id,
  source_draft_id,
  billing_entity_id,
  invoice_series_id,
  customer_id,
  invoice_number,
  currency,
  issue_date,
  due_date,
  seller_snapshot,
  buyer_snapshot,
  terms_snapshot,
  subtotal_minor,
  tax_minor,
  total_minor,
  issued_by
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000020',
  'CERT-000001',
  'USD',
  DATE '2026-09-04',
  DATE '2026-10-04',
  '{"legalName":"Certification Tenant A"}'::jsonb,
  '{"legalName":"Certification Customer A"}'::jsonb,
  '{}'::jsonb,
  10000,
  0,
  10000,
  'certification-actor'
);

INSERT INTO gigalibs_ar.invoice_lines (
  tenant_id, id, invoice_id, position, description, quantity, unit_amount_minor, amount_minor
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000041',
  '10000000-0000-4000-8000-000000000040',
  1,
  'Certification service',
  1,
  10000,
  10000
);

UPDATE gigalibs_ar.invoice_drafts
SET
  status = 'ISSUED',
  issued_invoice_id = '10000000-0000-4000-8000-000000000040',
  version = version + 1,
  updated_at = transaction_timestamp()
WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
  AND id = '10000000-0000-4000-8000-000000000030';

DO $$
DECLARE
  mutation_succeeded boolean := false;
BEGIN
  BEGIN
    UPDATE gigalibs_ar.invoices
    SET invoice_number = 'ILLEGAL-CHANGE'
    WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
      AND id = '10000000-0000-4000-8000-000000000040';
    mutation_succeeded := true;
  EXCEPTION WHEN SQLSTATE '23000' THEN
    NULL;
  END;

  IF mutation_succeeded THEN
    RAISE EXCEPTION 'immutable issued invoice accepted an update';
  END IF;
END;
$$;

SELECT set_config('app.tenant_id', '20000000-0000-4000-8000-000000000002', true);

DO $$
DECLARE
  visible_count integer;
  cross_tenant_insert_succeeded boolean := false;
BEGIN
  SELECT count(*) INTO visible_count FROM gigalibs_ar.customers;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'tenant B observed % tenant A customer rows', visible_count;
  END IF;

  BEGIN
    INSERT INTO gigalibs_ar.customers (
      tenant_id, id, legal_name, billing_email, currency, created_by, updated_by
    )
    VALUES (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000099',
      'Cross tenant insertion',
      'blocked@example.invalid',
      'USD',
      'certification-actor',
      'certification-actor'
    );
    cross_tenant_insert_succeeded := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF cross_tenant_insert_succeeded THEN
    RAISE EXCEPTION 'tenant B inserted a tenant A customer row';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
