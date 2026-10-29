BEGIN;
DROP FUNCTION IF EXISTS gigalibs_project_operations.relay_lease_project_ar_events(integer, integer);
DROP TABLE IF EXISTS gigalibs_project_operations.project_billing_timesheets;
DROP TABLE IF EXISTS gigalibs_project_operations.project_billing_requests;
DELETE FROM gigalibs_project_operations.schema_migrations WHERE version = 4;
COMMIT;
