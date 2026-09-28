-- WI-OI-059: enforce RLS even for table owners and require the canonical tenant key.
-- Forward-only; migrations 000001 and 000002 remain immutable.

BEGIN;

DO $$
DECLARE
  tenant_table text;
  existing_policy record;
  replacement_policy text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'tenant_connections',
    'connector_credentials',
    'raw_ingestion_journal',
    'sync_jobs',
    'audit_events'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE gigalibs_connectors.%I ENABLE ROW LEVEL SECURITY',
      tenant_table
    );
    EXECUTE format(
      'ALTER TABLE gigalibs_connectors.%I FORCE ROW LEVEL SECURITY',
      tenant_table
    );

    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'gigalibs_connectors'
        AND tablename = tenant_table
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON gigalibs_connectors.%I',
        existing_policy.policyname,
        tenant_table
      );
    END LOOP;

    replacement_policy := tenant_table || '_tenant_isolation_v3';
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_connectors.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      replacement_policy,
      tenant_table
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (3, '000003_connectors_force_rls', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
