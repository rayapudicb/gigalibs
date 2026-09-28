BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_tax.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tax_schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT tax_schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS gigalibs_tax.module_tenants (
  id varchar(64) PRIMARY KEY,
  oidc_issuer text NOT NULL,
  external_tenant_subject text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tax_module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT tax_module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

INSERT INTO gigalibs_tax.module_tenants (id, oidc_issuer, external_tenant_subject, status)
SELECT tenant_id, 'urn:gigalibs:legacy-unverified', tenant_id, 'SUSPENDED'
FROM (
  SELECT tenant_id FROM gigalibs_tax.tax_jurisdictions
  UNION SELECT tenant_id FROM gigalibs_tax.tax_rates
  UNION SELECT tenant_id FROM gigalibs_tax.exemption_certificates
  UNION SELECT tenant_id FROM gigalibs_tax.tax_calculation_ledger
  UNION SELECT tenant_id FROM gigalibs_tax.audit_events
  UNION SELECT tenant_id FROM gigalibs_tax.outbox_events
) legacy
ON CONFLICT (id) DO NOTHING;

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  ADD COLUMN IF NOT EXISTS idempotency_scope varchar(64) NOT NULL DEFAULT 'tax.calculate.v1',
  ADD COLUMN IF NOT EXISTS request_hash character(64),
  ADD COLUMN IF NOT EXISTS actor_subject text,
  ADD COLUMN IF NOT EXISTS correlation_id varchar(128);

UPDATE gigalibs_tax.tax_calculation_ledger
SET request_hash = md5(concat_ws('|', source_module, document_id, jurisdiction_code,
  product_category, taxable_amount_minor::text)) ||
  md5(concat_ws('|', source_module, document_id, jurisdiction_code,
  product_category, taxable_amount_minor::text, 'legacy'))
WHERE request_hash IS NULL;

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  ALTER COLUMN request_hash SET NOT NULL;

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  DROP CONSTRAINT IF EXISTS tax_calculation_ledger_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS tax_calculation_idempotency_scope_unique
  ON gigalibs_tax.tax_calculation_ledger (tenant_id, idempotency_scope, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS tax_jurisdiction_tenant_id_unique
  ON gigalibs_tax.tax_jurisdictions (tenant_id, id);

ALTER TABLE gigalibs_tax.tax_rates
  DROP CONSTRAINT IF EXISTS tax_rates_jurisdiction_id_fkey;

ALTER TABLE gigalibs_tax.tax_rates
  ADD CONSTRAINT tax_rates_tenant_jurisdiction_fk
  FOREIGN KEY (tenant_id, jurisdiction_id)
  REFERENCES gigalibs_tax.tax_jurisdictions (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  DROP CONSTRAINT IF EXISTS tax_calculation_ledger_jurisdiction_id_fkey;

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  ADD CONSTRAINT tax_ledger_tenant_jurisdiction_fk
  FOREIGN KEY (tenant_id, jurisdiction_id)
  REFERENCES gigalibs_tax.tax_jurisdictions (tenant_id, id)
  ON DELETE RESTRICT;

ALTER TABLE gigalibs_tax.tax_jurisdictions
  DROP CONSTRAINT IF EXISTS tax_jurisdiction_rates_check,
  ADD CONSTRAINT tax_jurisdiction_rates_check CHECK (
    standard_rate_basis_points BETWEEN 0 AND 10000
    AND reduced_rate_basis_points BETWEEN 0 AND 10000
  ),
  DROP CONSTRAINT IF EXISTS tax_jurisdiction_thresholds_check,
  ADD CONSTRAINT tax_jurisdiction_thresholds_check CHECK (
    economic_threshold_revenue_minor >= 0
    AND economic_threshold_transactions >= 0
    AND current_period_revenue_minor >= 0
    AND current_period_transactions >= 0
  );

ALTER TABLE gigalibs_tax.tax_rates
  DROP CONSTRAINT IF EXISTS tax_rates_values_check,
  ADD CONSTRAINT tax_rates_values_check CHECK (
    rate_basis_points BETWEEN 0 AND 10000
    AND (effective_until IS NULL OR effective_until >= effective_from)
  );

ALTER TABLE gigalibs_tax.exemption_certificates
  DROP CONSTRAINT IF EXISTS tax_exemptions_dates_check,
  ADD CONSTRAINT tax_exemptions_dates_check CHECK (valid_until >= valid_from);

ALTER TABLE gigalibs_tax.tax_calculation_ledger
  DROP CONSTRAINT IF EXISTS tax_ledger_amounts_check,
  ADD CONSTRAINT tax_ledger_amounts_check CHECK (
    taxable_amount_minor >= 0
    AND exempt_amount_minor BETWEEN 0 AND taxable_amount_minor
    AND calculated_tax_minor >= 0
    AND applied_rate_basis_points BETWEEN 0 AND 10000
  );

DO $$
DECLARE
  relation_name text;
  constraint_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'tax_jurisdictions', 'tax_rates', 'exemption_certificates',
    'tax_calculation_ledger', 'audit_events', 'outbox_events'
  ] LOOP
    constraint_name := relation_name || '_module_tenant_fk';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name AND connamespace = 'gigalibs_tax'::regnamespace
    ) THEN
      EXECUTE format(
        'ALTER TABLE gigalibs_tax.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES gigalibs_tax.module_tenants(id) ON DELETE RESTRICT',
        relation_name,
        constraint_name
      );
    END IF;
  END LOOP;
END
$$;

ALTER TABLE gigalibs_tax.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_tax.module_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_module_tenant_isolation ON gigalibs_tax.module_tenants;
CREATE POLICY tax_module_tenant_isolation ON gigalibs_tax.module_tenants
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'tax_jurisdictions', 'tax_rates', 'exemption_certificates',
    'tax_calculation_ledger', 'audit_events', 'outbox_events'
  ] LOOP
    policy_name := 'tax_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_tax.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_tax.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_tax.%I', policy_name, relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_tax.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_tax.schema_migrations (version, name)
VALUES
  (1, '000001_tax_foundation'),
  (2, '000002_tax_authority_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
