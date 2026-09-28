-- WI-OI-059: normalize all tenant-scoped Analytics RLS policies to app.tenant_id.
-- Forward-only correction; previously applied migrations remain immutable.

BEGIN;

DO $$
DECLARE
  tenant_table record;
  existing_policy record;
  replacement_policy text;
BEGIN
  FOR tenant_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'gigalibs_analytics'
      AND c.column_name = 'tenant_id'
      AND c.table_name <> 'schema_migrations'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE gigalibs_analytics.%I ENABLE ROW LEVEL SECURITY',
      tenant_table.table_name
    );
    EXECUTE format(
      'ALTER TABLE gigalibs_analytics.%I FORCE ROW LEVEL SECURITY',
      tenant_table.table_name
    );

    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'gigalibs_analytics'
        AND tablename = tenant_table.table_name
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON gigalibs_analytics.%I',
        existing_policy.policyname,
        tenant_table.table_name
      );
    END LOOP;

    replacement_policy := tenant_table.table_name || '_tenant_isolation_v11';
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_analytics.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      replacement_policy,
      tenant_table.table_name
    );
  END LOOP;
END
$$;

-- Tables without a tenant_id column retain parent/id-based tenant isolation.
ALTER TABLE gigalibs_analytics.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.module_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_module_tenant_isolation ON gigalibs_analytics.module_tenants;
CREATE POLICY analytics_module_tenant_isolation
  ON gigalibs_analytics.module_tenants
  FOR ALL
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_analytics.connector_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.connector_credential_refs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credential_refs_via_connection ON gigalibs_analytics.connector_credential_refs;
CREATE POLICY credential_refs_via_connection
  ON gigalibs_analytics.connector_credential_refs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM gigalibs_analytics.source_connections sc
      WHERE sc.id = connection_id
        AND sc.tenant_id = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM gigalibs_analytics.source_connections sc
      WHERE sc.id = connection_id
        AND sc.tenant_id = current_setting('app.tenant_id', true)
    )
  );

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (11, '000011_canonical_tenant_context', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
