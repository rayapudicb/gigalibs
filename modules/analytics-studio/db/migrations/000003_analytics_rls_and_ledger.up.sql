BEGIN;

-- 1. Create schema_migrations ledger
CREATE TABLE IF NOT EXISTS gigalibs_analytics.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT analytics_schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT analytics_schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- 2. Module tenants
CREATE TABLE IF NOT EXISTS gigalibs_analytics.module_tenants (
  id varchar(64) PRIMARY KEY,
  oidc_issuer text NOT NULL,
  external_tenant_subject text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT analytics_module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT analytics_module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

-- 3. Enable RLS and create isolation policies on all tenant tables
ALTER TABLE gigalibs_analytics.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_module_tenant_isolation ON gigalibs_analytics.module_tenants;
CREATE POLICY analytics_module_tenant_isolation ON gigalibs_analytics.module_tenants
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'tenant_analytics_configs', 'metric_snapshots', 'executive_actions', 'telemetry_series'
  ] LOOP
    policy_name := 'analytics_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_analytics.%I', policy_name, relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_analytics.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

-- 4. Populate ledger
INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES
  (1, '000001_analytics_lineage_and_audit'),
  (2, '000002_analytics_telemetry_series'),
  (3, '000003_analytics_rls_and_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
