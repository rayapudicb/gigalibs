BEGIN;

ALTER TABLE gigalibs_cmms.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.module_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cmms_module_tenant_isolation ON gigalibs_cmms.module_tenants;
CREATE POLICY cmms_module_tenant_isolation ON gigalibs_cmms.module_tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'locations', 'form_schemas', 'asset_categories', 'assets', 'asset_files',
    'asset_downtimes', 'meters', 'meter_readings', 'wo_categories', 'work_orders',
    'wo_labors', 'wo_additional_costs', 'wo_history', 'pm_schedules', 'parts',
    'part_transactions', 'vendors', 'customers', 'maintenance_requests',
    'audit_events', 'outbox_events'
  ] LOOP
    policy_name := 'cmms_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_cmms.%I', policy_name, relation_name);
    EXECUTE format(
      $policy$CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$policy$,
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (2, '000002_cmms_rls_and_policies')
ON CONFLICT (version) DO NOTHING;

COMMIT;
