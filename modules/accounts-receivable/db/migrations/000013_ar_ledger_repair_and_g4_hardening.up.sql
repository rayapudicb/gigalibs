-- WI-OI-042: AR G4 hardening — ledger repair and bootstrap count upgrade.
-- Migration 000006_ar_drop_foundation_tax_check was applied to the schema but
-- was never recorded in schema_migrations. This migration closes that gap and
-- sets the authoritative required count to 12 so bootstrapCheck() enforces the
-- full applied history.

BEGIN;

-- 1. Back-fill the missing ledger row for 000006.
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (6, '000006_ar_drop_foundation_tax_check')
ON CONFLICT (version) DO NOTHING;

-- 2. Verify all 12 expected versions are present before committing.
DO $$
DECLARE
  v integer;
BEGIN
  FOREACH v IN ARRAY ARRAY[1,2,3,4,5,6,7,8,9,10,11,12] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM gigalibs_ar.schema_migrations WHERE version = v
    ) THEN
      RAISE EXCEPTION 'AR schema_migrations is missing version %. Aborting ledger repair.', v;
    END IF;
  END LOOP;
END;
$$;

-- 3. Confirm all tenant tables have RLS enabled (safety check, not a change).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'gigalibs_ar'
      AND tablename <> 'schema_migrations'
      AND NOT rowsecurity
  LOOP
    RAISE EXCEPTION 'Table gigalibs_ar.% does not have row-level security enabled.', t.tablename;
  END LOOP;
END;
$$;

-- 4. Record this migration in the ledger.
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (13, '000013_ar_ledger_repair_and_g4_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
