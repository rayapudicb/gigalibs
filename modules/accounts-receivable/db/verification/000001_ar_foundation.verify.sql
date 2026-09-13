DO $$
DECLARE
  missing_tables text[];
  missing_rls_tables text[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'gigalibs_ar_api_runtime' AND (rolsuper OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'API runtime group role is over-privileged';
  END IF;

  IF has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.invoices', 'UPDATE')
    OR has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.invoices', 'DELETE')
    OR has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.audit_events', 'SELECT')
    OR has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.audit_events', 'UPDATE')
    OR has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.outbox_events', 'SELECT')
    OR has_table_privilege('gigalibs_ar_api_runtime', 'gigalibs_ar.outbox_events', 'UPDATE')
  THEN
    RAISE EXCEPTION 'API runtime group role has privileges outside the foundation API boundary';
  END IF;

  SELECT array_agg(required.name ORDER BY required.name)
  INTO missing_tables
  FROM (
    VALUES
      ('schema_migrations'),
      ('module_tenants'),
      ('billing_entities'),
      ('invoice_series'),
      ('customers'),
      ('invoice_drafts'),
      ('invoice_draft_lines'),
      ('invoices'),
      ('invoice_lines'),
      ('idempotency_records'),
      ('audit_events'),
      ('outbox_events')
  ) AS required(name)
  WHERE to_regclass('gigalibs_ar.' || required.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing AR foundation tables: %', missing_tables;
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO missing_rls_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'gigalibs_ar'
    AND c.relkind = 'r'
    AND c.relname <> 'schema_migrations'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF missing_rls_tables IS NOT NULL THEN
    RAISE EXCEPTION 'AR tables missing forced RLS: %', missing_rls_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM gigalibs_ar.schema_migrations
    WHERE version = 1 AND name = '000001_ar_foundation'
  ) THEN
    RAISE EXCEPTION 'AR migration version 1 is not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'gigalibs_ar'
      AND c.relname = 'invoices'
      AND t.tgname = 'invoices_immutable'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'immutable invoice trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'gigalibs_ar' AND indexname = 'outbox_pending_idx'
  ) THEN
    RAISE EXCEPTION 'pending outbox index is missing';
  END IF;
END;
$$;
