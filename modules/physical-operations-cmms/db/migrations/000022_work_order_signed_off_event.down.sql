-- WI-OI-120bi rollback: remove SIGNED_OFF from allowed work-order event types (fails if any SIGNED_OFF rows exist).
BEGIN;

ALTER TABLE gigalibs_cmms.work_order_events DROP CONSTRAINT work_order_events_event_type_check;
ALTER TABLE gigalibs_cmms.work_order_events ADD CONSTRAINT work_order_events_event_type_check CHECK (event_type IN (
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'TASK_RECORDED', 'LABOUR_LOGGED', 'PART_ISSUED', 'NOTE_ADDED',
  'STAFFING_REQUESTED', 'STAFFING_UPDATED'));

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 22;

COMMIT;
