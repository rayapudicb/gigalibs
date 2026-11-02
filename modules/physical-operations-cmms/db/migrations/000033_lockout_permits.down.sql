-- WI-OI-142: removes the lockout and permit tables. Run only while empty; otherwise keep migration 33 and roll forward.
BEGIN;
DROP TABLE gigalibs_cmms.permit_gas_tests;
DROP TABLE gigalibs_cmms.permit_lock_events;
DROP TABLE gigalibs_cmms.permit_lock_photos;
DROP TABLE gigalibs_cmms.permit_isolations;
DROP TABLE gigalibs_cmms.permits;
DROP TABLE gigalibs_cmms.permit_counters;
DROP TABLE gigalibs_cmms.isolation_procedures;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 33;
COMMIT;
