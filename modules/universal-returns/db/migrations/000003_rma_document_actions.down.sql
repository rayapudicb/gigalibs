BEGIN;
DROP TABLE IF EXISTS gigalibs_universal_returns.document_action_outcomes;
DELETE FROM gigalibs_universal_returns.schema_migrations WHERE version = 3;
COMMIT;
