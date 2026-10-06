-- Rollback of 000009 (WI-OI-120l): draft journals and the record dispatcher's Idempotency-Key table. Drafts are not
-- ledger entries: a posted draft's journal stays in gl_journals.
BEGIN;
DROP TABLE IF EXISTS gigalibs_finance.gl_journal_draft_lines;
DROP TABLE IF EXISTS gigalibs_finance.gl_journal_drafts;
DROP TABLE IF EXISTS gigalibs_finance.record_idempotency;
DELETE FROM gigalibs_finance.schema_migrations WHERE version = 9;
COMMIT;
