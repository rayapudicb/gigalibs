-- WI-OI-120c (U2): Finance sign-in check, organization replica row-level security and exactly-once journals.
BEGIN;

-- 1. The module SDK guard (packages/module-sdk/src/database.ts) reads revocation_type, session_id, subject_id and
--    invalid_through_auth_version. This table had an older shape, so every signed-in request failed (audit P1-02).
--    The table has no writer yet and was empty on every known database; SET NOT NULL fails loudly if it is not.
ALTER TABLE gigalibs_finance.auth_revocation_events
  ADD COLUMN IF NOT EXISTS revocation_type varchar(32),
  ADD COLUMN IF NOT EXISTS session_id varchar(128),
  ADD COLUMN IF NOT EXISTS subject_id varchar(128),
  ADD COLUMN IF NOT EXISTS invalid_through_auth_version integer,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE gigalibs_finance.auth_revocation_events ALTER COLUMN token_id DROP NOT NULL;
ALTER TABLE gigalibs_finance.auth_revocation_events ALTER COLUMN revocation_type SET NOT NULL;
ALTER TABLE gigalibs_finance.auth_revocation_events
  ADD CONSTRAINT auth_revocation_events_type CHECK (revocation_type IN ('SESSION', 'SUBJECT_AUTH_VERSION')),
  ADD CONSTRAINT auth_revocation_events_shape
  CHECK ((revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
      OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL));
CREATE INDEX IF NOT EXISTS finance_auth_session ON gigalibs_finance.auth_revocation_events (tenant_id, session_id)
  WHERE revocation_type = 'SESSION';
CREATE INDEX IF NOT EXISTS finance_auth_subject
  ON gigalibs_finance.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version)
  WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

-- 2. Organization replica tables had no row-level security (audit P1-18). Same policy as every other module table.
DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['org_replica_versions', 'org_replica_units', 'org_replica_closure']
  LOOP
    EXECUTE format('ALTER TABLE gigalibs_finance.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_finance.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_finance.%I', relation || '_tenant_isolation', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_finance.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

-- 3. A source document posts each entry type to a book at most once, so a retried command or a redelivered event
--    never creates a second journal (audit P0-09). Checked free of duplicates on the UAT instance before release.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_journals_source_document
  ON gigalibs_finance.gl_journals (tenant_id, accounting_book_id, source_document_type, source_document_id, entry_type)
  WHERE source_document_id IS NOT NULL;

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (8)
ON CONFLICT (version) DO NOTHING;

COMMIT;
