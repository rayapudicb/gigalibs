-- WI-OI-120c: removes the journal uniqueness, the revocation constraints and the ledger row; RLS stays on.
BEGIN;
DROP INDEX IF EXISTS gigalibs_finance.uq_gl_journals_source_document;
DROP INDEX IF EXISTS gigalibs_finance.finance_auth_session;
DROP INDEX IF EXISTS gigalibs_finance.finance_auth_subject;
ALTER TABLE gigalibs_finance.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_shape;
ALTER TABLE gigalibs_finance.auth_revocation_events DROP CONSTRAINT IF EXISTS auth_revocation_events_type;
DELETE FROM gigalibs_finance.schema_migrations WHERE version = 8;
COMMIT;
