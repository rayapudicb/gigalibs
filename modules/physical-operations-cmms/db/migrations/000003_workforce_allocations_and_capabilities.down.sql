BEGIN;

DROP TABLE IF EXISTS gigalibs_cmms.allocation_status_history CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.resource_allocations CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.resource_capabilities CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.workforce_resources CASCADE;

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 3;

COMMIT;
