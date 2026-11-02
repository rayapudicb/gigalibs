-- WI-OI-138: removes the work-instruction tables. Run only while empty; otherwise keep migration 30 and roll forward.
BEGIN;
DROP TABLE gigalibs_cmms.sop_feedback;
DROP TABLE gigalibs_cmms.sop_result_photos;
DROP TABLE gigalibs_cmms.sop_step_results;
DROP FUNCTION gigalibs_cmms.sop_step_results_guard();
DROP TABLE gigalibs_cmms.sop_executions;
DROP TABLE gigalibs_cmms.sop_step_images;
DROP TABLE gigalibs_cmms.sop_procedures;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 30;
COMMIT;
