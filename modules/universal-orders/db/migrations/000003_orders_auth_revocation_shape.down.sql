-- WI-OI-120c: the shape is additive; the down migration removes the constraints, indexes and ledger row only.
BEGIN;
DROP INDEX IF EXISTS gigalibs_orders.orders_auth_session;
DROP INDEX IF EXISTS gigalibs_orders.orders_auth_subject;
ALTER TABLE gigalibs_orders.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_shape;
ALTER TABLE gigalibs_orders.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_type;
DELETE FROM gigalibs_orders.schema_migrations WHERE version = 3;
COMMIT;
