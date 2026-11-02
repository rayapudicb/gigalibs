-- WI-OI-139: removes the fleet inspection tables and the FLEET_DEFECT origin. Run only while empty (no fleet work
-- orders); otherwise keep migration 31 and roll forward.
BEGIN;
ALTER TABLE gigalibs_cmms.work_orders DROP CONSTRAINT work_orders_trigger_source_check;
ALTER TABLE gigalibs_cmms.work_orders ADD CONSTRAINT work_orders_trigger_source_check
  CHECK (trigger_source IN ('MANUAL', 'PM_SCHEDULE', 'METER_TRIGGER', 'ROUND_EXCEPTION', 'CALIBRATION'));
DROP TABLE gigalibs_cmms.fleet_groundings;
DROP TABLE gigalibs_cmms.fleet_inspection_photos;
DROP TABLE gigalibs_cmms.fleet_inspection_results;
DROP TABLE gigalibs_cmms.fleet_inspections;
DROP TABLE gigalibs_cmms.fleet_enrollments;
DROP TABLE gigalibs_cmms.fleet_check_templates;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 31;
COMMIT;
