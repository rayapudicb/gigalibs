BEGIN;

ALTER TABLE gigalibs_iot.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_iot.module_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY iot_module_tenant_isolation ON gigalibs_iot.module_tenants
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'iot_devices', 'iot_sensors', 'iot_device_bindings', 'iot_telemetry_raw',
    'iot_condition_rules', 'iot_alerts', 'protocol_adapters', 'discovery_scans',
    'audit_events', 'outbox_events'
  ] LOOP
    policy_name := 'iot_' || relation_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_iot.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE gigalibs_iot.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_iot.%I', policy_name, relation_name);
    EXECUTE format(
      $policy$CREATE POLICY %I ON gigalibs_iot.%I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''))$policy$,
      policy_name,
      relation_name
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_iot.schema_migrations (version, name)
VALUES (2, '000002_iot_rls');

COMMIT;
