BEGIN;

DROP VIEW IF EXISTS gigalibs_ar.invoice_aging;

DROP TRIGGER IF EXISTS collection_events_immutable ON gigalibs_ar.collection_events;
DROP FUNCTION IF EXISTS gigalibs_ar.reject_collection_event_change();
DROP TABLE IF EXISTS gigalibs_ar.collection_events;

DROP TRIGGER IF EXISTS credit_note_lines_immutable ON gigalibs_ar.credit_note_lines;
DROP TABLE IF EXISTS gigalibs_ar.credit_note_lines;

DROP TRIGGER IF EXISTS credit_notes_immutable ON gigalibs_ar.credit_notes;
DROP FUNCTION IF EXISTS gigalibs_ar.reject_credit_note_change();
DROP TABLE IF EXISTS gigalibs_ar.credit_notes;

DELETE FROM gigalibs_ar.schema_migrations WHERE version = 9;

COMMIT;
