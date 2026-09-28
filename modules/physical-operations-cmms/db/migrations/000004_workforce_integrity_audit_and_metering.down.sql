BEGIN;

DROP TRIGGER IF EXISTS allocation_status_history_append_only
  ON gigalibs_cmms.allocation_status_history;
DROP FUNCTION IF EXISTS gigalibs_cmms.reject_allocation_history_mutation();
DROP TABLE IF EXISTS gigalibs_cmms.workforce_usage_events;
ALTER TABLE gigalibs_cmms.resource_allocations
  DROP CONSTRAINT IF EXISTS allocations_work_order_fk;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 4;

COMMIT;
