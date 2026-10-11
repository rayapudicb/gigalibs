-- WI-OI-121i: Rollback migration for 000001_assistant_private_threads
BEGIN;

DROP TABLE IF EXISTS gigalibs_assistant.auth_revocation_events CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.audit_events CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.assistant_runs CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.assistant_messages CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.assistant_threads CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.tenant_policies CASCADE;
DROP TABLE IF EXISTS gigalibs_assistant.schema_migrations CASCADE;

COMMIT;
