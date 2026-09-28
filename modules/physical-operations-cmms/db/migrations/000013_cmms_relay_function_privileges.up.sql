-- WI-OI-068 hardening: the relay's SECURITY DEFINER functions are its only cross-tenant access, so no role but the
-- CMMS runtime role may execute them. Revokes the PostgreSQL default PUBLIC EXECUTE; the migration runner grants
-- EXECUTE to the runtime role on every run. Forward-only.
BEGIN;

REVOKE ALL ON FUNCTION gigalibs_cmms.relay_lease_workforce_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_cmms.relay_settle_workforce_event(text, boolean, text, integer, integer) FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gigalibs_cmms REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (13, '000013_cmms_relay_function_privileges');

COMMIT;
