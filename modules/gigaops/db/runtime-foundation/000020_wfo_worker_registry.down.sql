-- Rollback migration for 000020_wfo_worker_registry
BEGIN;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_compliance_documents CASCADE;
DROP TABLE IF EXISTS gigalibs_workforce.wfo_workers CASCADE;

COMMIT;
