DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM gigalibs_ar.schema_migrations
    WHERE version = 2 AND name = '000002_ar_outbox_delivery'
  ) THEN
    RAISE EXCEPTION 'migration 000002 is not recorded';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'gigalibs_ar' AND table_name = 'outbox_events'
      AND column_name = 'dead_lettered_at'
  ) THEN
    RAISE EXCEPTION 'outbox lease/dead-letter columns are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'gigalibs_ar' AND tablename = 'outbox_events'
      AND policyname = 'outbox_events_worker_policy'
  ) THEN
    RAISE EXCEPTION 'outbox worker RLS policy is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'gigalibs_ar_outbox_worker' AND (rolsuper OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'outbox worker group role is over-privileged';
  END IF;
END;
$$;
