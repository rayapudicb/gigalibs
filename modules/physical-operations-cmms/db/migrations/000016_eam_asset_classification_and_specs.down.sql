BEGIN;

ALTER TABLE gigalibs_cmms.assets DROP CONSTRAINT IF EXISTS assets_classification_fk;
DROP INDEX IF EXISTS gigalibs_cmms.assets_by_classification;
ALTER TABLE gigalibs_cmms.assets DROP COLUMN IF EXISTS classification_id;

DROP TABLE IF EXISTS gigalibs_cmms.cmms_asset_specs CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.cmms_asset_spec_definitions CASCADE;
DROP TABLE IF EXISTS gigalibs_cmms.cmms_asset_classifications CASCADE;

DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 16;

COMMIT;
