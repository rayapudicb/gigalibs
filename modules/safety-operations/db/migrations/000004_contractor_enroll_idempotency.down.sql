BEGIN;
DELETE FROM gigalibs_safety_operations.schema_migrations WHERE version = 4;
DROP INDEX IF EXISTS gigalibs_safety_operations.contractor_workers_enroll_operation;
ALTER TABLE gigalibs_safety_operations.contractor_workers
  DROP COLUMN IF EXISTS enroll_client_operation_id;
COMMIT;
