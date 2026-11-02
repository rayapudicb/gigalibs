BEGIN;
DELETE FROM gigalibs_safety_operations.schema_migrations WHERE version = 3;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_escorts;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_visits;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_passes;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_inductions;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_workers;
DROP TABLE IF EXISTS gigalibs_safety_operations.contractor_companies;
COMMIT;
