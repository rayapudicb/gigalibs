BEGIN;
DROP FUNCTION IF EXISTS gigalibs_iot.relay_settle_cmms_event(text, uuid, boolean, text, integer, integer);
DROP FUNCTION IF EXISTS gigalibs_iot.relay_lease_cmms_events(integer, integer);
DELETE FROM gigalibs_iot.schema_migrations WHERE version = 4;
COMMIT;
