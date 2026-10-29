BEGIN;

DROP TABLE IF EXISTS gigalibs_universal_returns.dispositions;
DROP TABLE IF EXISTS gigalibs_universal_returns.rma_lines;
DROP TABLE IF EXISTS gigalibs_universal_returns.rma;
DROP TABLE IF EXISTS gigalibs_universal_returns.rma_types;

DELETE FROM gigalibs_universal_returns.schema_migrations WHERE version = 2;

COMMIT;
