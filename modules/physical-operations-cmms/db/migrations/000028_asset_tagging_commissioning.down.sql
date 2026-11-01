-- WI-OI-135: removes the tagging, commissioning and audit tables. Run only while they are empty; with data, keep
-- migration 28 and roll forward.
BEGIN;
DROP TABLE gigalibs_cmms.asset_audit_sightings;
DROP TABLE gigalibs_cmms.asset_audit_walks;
DROP TABLE gigalibs_cmms.asset_commissioning_requests;
DROP TABLE gigalibs_cmms.asset_physical_tags;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 28;
COMMIT;
