-- WI-OI-137: removes the logbook tables. Run only while they are empty; otherwise keep migration 29 and roll forward.
BEGIN;
DROP TABLE gigalibs_workforce.logbook_handovers;
DROP FUNCTION gigalibs_workforce.logbook_handovers_guard();
DROP TABLE gigalibs_workforce.logbook_bypasses;
DROP TABLE gigalibs_workforce.logbook_entries;
DROP TABLE gigalibs_workforce.logbooks;
DELETE FROM gigalibs_workforce.schema_migrations WHERE version = 29;
COMMIT;
