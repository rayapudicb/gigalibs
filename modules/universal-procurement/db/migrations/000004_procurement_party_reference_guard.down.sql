BEGIN;

DROP FUNCTION IF EXISTS gigalibs_procurement.require_active_party(varchar, uuid);

DELETE FROM gigalibs_procurement.schema_migrations WHERE version = 4;

COMMIT;
