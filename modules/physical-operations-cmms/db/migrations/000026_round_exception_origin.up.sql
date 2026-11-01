-- WI-OI-133: retain Rounds provenance on corrective work orders.
BEGIN;

ALTER TABLE gigalibs_cmms.work_orders DROP CONSTRAINT work_orders_trigger_source_check;
ALTER TABLE gigalibs_cmms.work_orders ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER', 'ROUND_EXCEPTION'));

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (26, '000026_round_exception_origin');

COMMIT;
