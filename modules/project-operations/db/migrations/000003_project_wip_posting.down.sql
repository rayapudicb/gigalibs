BEGIN;

DROP FUNCTION IF EXISTS gigalibs_project_operations.relay_settle_project_event(varchar, boolean, text, integer, integer);
DROP FUNCTION IF EXISTS gigalibs_project_operations.relay_lease_project_finance_events(integer, integer);
DROP TABLE IF EXISTS gigalibs_project_operations.project_cost_postings;

ALTER TABLE gigalibs_project_operations.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE gigalibs_project_operations.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED'));

DELETE FROM gigalibs_project_operations.schema_migrations WHERE version = 3;

COMMIT;
