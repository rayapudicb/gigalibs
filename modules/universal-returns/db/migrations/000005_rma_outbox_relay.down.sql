BEGIN;

DROP FUNCTION IF EXISTS gigalibs_universal_returns.relay_settle_returns_event(varchar, boolean, text, integer, integer);
DROP FUNCTION IF EXISTS gigalibs_universal_returns.relay_lease_returns_finance_events(integer, integer);
DROP FUNCTION IF EXISTS gigalibs_universal_returns.relay_lease_returns_orders_events(integer, integer);

ALTER TABLE gigalibs_universal_returns.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE gigalibs_universal_returns.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED'));

DELETE FROM gigalibs_universal_returns.schema_migrations WHERE version = 5;

COMMIT;
