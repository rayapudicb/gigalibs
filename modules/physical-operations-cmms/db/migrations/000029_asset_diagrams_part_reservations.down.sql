-- WI-OI-136: removes diagrams and reservations. Run only while empty; with data, keep migration 29 and roll forward.
BEGIN;
DROP TABLE gigalibs_cmms.part_reservations;
DROP TABLE gigalibs_cmms.asset_diagram_hotspots;
DROP TABLE gigalibs_cmms.asset_diagrams;
DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 29;
COMMIT;
