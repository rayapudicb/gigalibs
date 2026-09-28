BEGIN;

-- 1. Create schema_migrations ledger
CREATE TABLE IF NOT EXISTS gigalibs_platform.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT platform_schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT platform_schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- 2. Enable RLS and policies on platform_tenants
ALTER TABLE gigalibs_platform.platform_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_platform.platform_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_tenants_isolation ON gigalibs_platform.platform_tenants;
CREATE POLICY platform_tenants_isolation ON gigalibs_platform.platform_tenants
  USING (
    current_setting('app.tenant_id', true) IS NULL
    OR current_setting('app.tenant_id', true) = ''
    OR id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.tenant_id', true) IS NULL
    OR current_setting('app.tenant_id', true) = ''
    OR id = current_setting('app.tenant_id', true)
  );

-- 3. Enable RLS on tenant tables in gigalibs_platform
DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'billing_invoices', 'ledger_transactions', 'module_purchases',
    'tenant_credit_wallets', 'tenant_usage_ledger'
  ] LOOP
    policy_name := 'platform_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_platform.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_platform.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_platform.%I', policy_name, relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_platform.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

-- 4. Record migrations
INSERT INTO gigalibs_platform.schema_migrations (version, name)
VALUES
  (1, '000001_platform_control_foundation'),
  (2, '000002_tenant_rbac_template'),
  (3, '000003_platform_rls_and_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
