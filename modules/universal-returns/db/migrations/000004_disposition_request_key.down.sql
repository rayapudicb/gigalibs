BEGIN;

DROP INDEX IF EXISTS gigalibs_universal_returns.dispositions_tenant_request_key;
ALTER TABLE gigalibs_universal_returns.dispositions DROP COLUMN IF EXISTS request_key;

DELETE FROM gigalibs_universal_returns.schema_migrations WHERE version = 4;

COMMIT;
