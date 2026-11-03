-- WI-OI-167: removes the requirement's owning unit. Run only while no requirement names a unit; otherwise keep
-- migration 30 and roll forward.
BEGIN;
DROP INDEX gigalibs_workforce.work_requirements_unit;
ALTER TABLE gigalibs_workforce.work_requirements DROP COLUMN organization_unit_id;
DELETE FROM gigalibs_workforce.schema_migrations WHERE version = 30;
COMMIT;
