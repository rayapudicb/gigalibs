-- Rollback Migration 000005: Remove department_id scope columns from core CMMS tables
BEGIN;

ALTER TABLE gigalibs_cmms.pm_schedules    DROP COLUMN IF EXISTS department_id;
ALTER TABLE gigalibs_cmms.parts           DROP COLUMN IF EXISTS department_id;
ALTER TABLE gigalibs_cmms.locations       DROP COLUMN IF EXISTS department_id;
ALTER TABLE gigalibs_cmms.work_orders     DROP COLUMN IF EXISTS department_id;
ALTER TABLE gigalibs_cmms.assets          DROP COLUMN IF EXISTS department_id;

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 5;

COMMIT;
