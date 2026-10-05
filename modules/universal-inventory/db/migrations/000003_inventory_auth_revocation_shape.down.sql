-- WI-OI-120c: the shape is additive; the down migration removes the constraints, indexes and ledger row only.
BEGIN;
DROP INDEX IF EXISTS gigalibs_inventory.inventory_auth_session;
DROP INDEX IF EXISTS gigalibs_inventory.inventory_auth_subject;
ALTER TABLE gigalibs_inventory.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_shape;
ALTER TABLE gigalibs_inventory.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_type;
DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 3;
COMMIT;
