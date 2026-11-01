-- Roll forward by first resolving or reclassifying ROUND_EXCEPTION rows, then restore the previous constraint.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_cmms.work_orders WHERE trigger_source = 'ROUND_EXCEPTION') THEN
    RAISE EXCEPTION 'ROUND_EXCEPTION work orders exist; use a reviewed roll-forward correction';
  END IF;
END $$;
ALTER TABLE gigalibs_cmms.work_orders DROP CONSTRAINT work_orders_trigger_source_check;
ALTER TABLE gigalibs_cmms.work_orders ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER'));
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 26;
COMMIT;
