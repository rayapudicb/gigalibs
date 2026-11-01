-- Staged batches are transient (finalize deletes them; staging prunes stale ones), so the table can go after the
-- release that writes them is rolled back. An in-flight upload is lost; the author saves the draft again.
BEGIN;
DROP TABLE gigalibs_operator_rounds.checkpoint_upload_batches;
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=9;
COMMIT;
