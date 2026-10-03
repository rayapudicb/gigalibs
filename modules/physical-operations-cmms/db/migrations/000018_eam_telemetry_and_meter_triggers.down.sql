-- WI-EAM-004 Down Migration

ALTER TABLE gigalibs_cmms.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_meter_trigger_fk,
  DROP COLUMN IF EXISTS meter_trigger_id;

DROP TABLE IF EXISTS gigalibs_cmms.cmms_meter_triggers CASCADE;

ALTER TABLE gigalibs_cmms.meter_readings
  DROP COLUMN IF EXISTS payload_ref,
  DROP COLUMN IF EXISTS device_id;
