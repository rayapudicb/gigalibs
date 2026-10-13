-- WI-OI-120u: removes the record dispatcher's idempotency table and this migration's ledger row.
BEGIN;
DROP TABLE IF EXISTS gigalibs_workforce.record_idempotency;
DELETE FROM gigalibs_workforce.schema_migrations WHERE version = 27;
COMMIT;
