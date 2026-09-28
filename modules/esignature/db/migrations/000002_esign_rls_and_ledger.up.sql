BEGIN;

-- 1. Create schema_migrations ledger
CREATE TABLE IF NOT EXISTS gigalibs_esign.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT esign_schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT esign_schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- 2. Module tenants
CREATE TABLE IF NOT EXISTS gigalibs_esign.module_tenants (
  id varchar(64) PRIMARY KEY,
  oidc_issuer text NOT NULL,
  external_tenant_subject text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT esign_module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT esign_module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

-- 3. Enable RLS and create isolation policies on all tenant tables
ALTER TABLE gigalibs_esign.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_esign.module_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esign_module_tenant_isolation ON gigalibs_esign.module_tenants;
CREATE POLICY esign_module_tenant_isolation ON gigalibs_esign.module_tenants
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'tenant_esign_configs', 'esign_envelopes', 'esign_recipients',
    'esign_audit_events', 'esign_reconciliation_receipts'
  ] LOOP
    policy_name := 'esign_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_esign.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_esign.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_esign.%I', policy_name, relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_esign.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

-- 4. Populate ledger
INSERT INTO gigalibs_esign.schema_migrations (version, name)
VALUES
  (1, '000001_esign_envelopes_and_pki'),
  (2, '000002_esign_rls_and_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
