-- WI-OI-120bi: allow SIGNED_OFF on the work-order timeline (sign-off API appends this event).
BEGIN;

ALTER TABLE gigalibs_cmms.work_order_events DROP CONSTRAINT work_order_events_event_type_check;
ALTER TABLE gigalibs_cmms.work_order_events ADD CONSTRAINT work_order_events_event_type_check CHECK (event_type IN (
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'TASK_RECORDED', 'LABOUR_LOGGED', 'PART_ISSUED', 'NOTE_ADDED',
  'STAFFING_REQUESTED', 'STAFFING_UPDATED', 'SIGNED_OFF'));

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (22, '000022_work_order_signed_off_event');

COMMIT;
