-- Rollback for WI-EAM-001: Enterprise Spatial Topology, CAFM Hierarchy & CAD/BIM Foundation
BEGIN;

ALTER TABLE gigalibs_cmms.assets
  DROP CONSTRAINT IF EXISTS assets_space_fk;

DROP INDEX IF EXISTS gigalibs_cmms.assets_by_space;

ALTER TABLE gigalibs_cmms.assets
  DROP COLUMN IF EXISTS space_id;

DROP TABLE IF EXISTS gigalibs_cmms.cmms_spaces CASCADE;

DELETE FROM gigalibs_cmms.schema_migrations
WHERE version = 15;

COMMIT;
