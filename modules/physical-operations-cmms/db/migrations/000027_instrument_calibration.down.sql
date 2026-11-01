-- WI-OI-134: removes the calibration tables. Run only while they are empty; with calibration data or a CALIBRATION
-- work order, keep migration 27 and roll forward (the constraint change below then fails and nothing is dropped).
BEGIN;

ALTER TABLE gigalibs_cmms.work_orders DROP CONSTRAINT work_orders_trigger_source_check;
ALTER TABLE gigalibs_cmms.work_orders ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER', 'ROUND_EXCEPTION'));

DROP TABLE gigalibs_cmms.calibration_points;
DROP TABLE gigalibs_cmms.calibration_record_standards;
DROP TABLE gigalibs_cmms.calibration_records;
DROP FUNCTION gigalibs_cmms.calibration_records_guard();
DROP TABLE gigalibs_cmms.calibration_profiles;
DROP TABLE gigalibs_cmms.calibration_standards;

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 27;

COMMIT;
