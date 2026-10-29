BEGIN;
DELETE FROM gigalibs_universal_manufacturing.schema_migrations WHERE version = 4;
DROP FUNCTION IF EXISTS gigalibs_universal_manufacturing.relay_settle_manufacturing_event(varchar, boolean, text, integer, integer);
DROP FUNCTION IF EXISTS gigalibs_universal_manufacturing.relay_lease_manufacturing_events(integer, integer);
COMMIT;
