BEGIN;
DROP INDEX IF EXISTS gigalibs_operator_rounds.reading_checkpoint_recent;
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=8;
COMMIT;
