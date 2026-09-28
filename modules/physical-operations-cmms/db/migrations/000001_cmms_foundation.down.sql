BEGIN;

DROP SCHEMA IF EXISTS gigalibs_cmms CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_cmms_api_runtime') THEN
    DROP ROLE gigalibs_cmms_api_runtime;
  END IF;
END;
$$;

COMMIT;
