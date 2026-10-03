-- Rollback WI-EAM-003: Maintenance Manuals, Standard Procedures & Failure Mode Hierarchy

ALTER TABLE gigalibs_cmms.work_orders
    DROP CONSTRAINT IF EXISTS work_orders_job_plan_fk,
    DROP CONSTRAINT IF EXISTS work_orders_remedy_fk,
    DROP CONSTRAINT IF EXISTS work_orders_cause_fk,
    DROP CONSTRAINT IF EXISTS work_orders_problem_fk,
    DROP COLUMN IF EXISTS job_plan_id,
    DROP COLUMN IF EXISTS failure_remedy_id,
    DROP COLUMN IF EXISTS failure_cause_id,
    DROP COLUMN IF EXISTS failure_problem_id;

DROP TABLE IF EXISTS gigalibs_cmms.cmms_job_plan_tasks CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.cmms_job_plans CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.cmms_failure_codes CASCADE;
