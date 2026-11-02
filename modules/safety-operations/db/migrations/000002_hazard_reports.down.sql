-- WI-OI-141: removes the hazard tables. Run only while empty; otherwise keep migration 2 and roll forward.
BEGIN;
DROP TABLE gigalibs_safety_operations.hazard_investigations;
DROP TABLE gigalibs_safety_operations.stop_work_acknowledgements;
DROP TABLE gigalibs_safety_operations.stop_work_alerts;
DROP TABLE gigalibs_safety_operations.hazard_photos;
DROP TABLE gigalibs_safety_operations.hazard_reports;
DROP TABLE gigalibs_safety_operations.hazard_counters;
DELETE FROM gigalibs_safety_operations.schema_migrations WHERE version = 2;
COMMIT;
