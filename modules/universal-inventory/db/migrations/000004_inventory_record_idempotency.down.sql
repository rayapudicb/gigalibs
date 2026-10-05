-- Rollback of 000004 (WI-OI-120f): the record dispatcher's Idempotency-Key table.
BEGIN;
DROP TABLE IF EXISTS gigalibs_inventory.record_idempotency;
DELETE FROM gigalibs_inventory.schema_migrations WHERE version = 4;
COMMIT;
