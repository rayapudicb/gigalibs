BEGIN;

DROP TABLE IF EXISTS gigalibs_cmms.maintenance_requests;
DROP TABLE IF EXISTS gigalibs_cmms.request_counters;

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 20;

COMMIT;
