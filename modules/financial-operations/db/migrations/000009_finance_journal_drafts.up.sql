-- WI-OI-120l (U12, owner decision 2026-10-06 "Option A"): manual journals are drafted, submitted and approved by a
-- second person before they post. Drafts live beside the ledger, which only ever holds posted journals; approval
-- posts through the existing posting path, with the draft as its source document, so a draft posts at most once.
-- Also the record dispatcher's Idempotency-Key table for Finance's metadata windows. Forward-only; additive.
BEGIN;

CREATE TABLE gigalibs_finance.record_idempotency (
  tenant_id varchar(64) NOT NULL,
  idempotency_key uuid NOT NULL,
  operation varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  state varchar(16) NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, idempotency_key),
  CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX record_idempotency_created ON gigalibs_finance.record_idempotency (created_at);

CREATE TABLE gigalibs_finance.gl_journal_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  accounting_book_id uuid NOT NULL REFERENCES gigalibs_finance.accounting_books (id) ON DELETE RESTRICT,
  fiscal_period_id uuid NOT NULL REFERENCES gigalibs_finance.fiscal_periods (id) ON DELETE RESTRICT,
  posting_date date NOT NULL,
  entry_type varchar(30) NOT NULL DEFAULT 'STANDARD_MANUAL' CHECK (entry_type IN ('STANDARD_MANUAL', 'OPENING_BALANCE')),
  description varchar(1000) NOT NULL CHECK (length(btrim(description)) > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'POSTED')),
  submitted_by varchar(128),
  submitted_at timestamptz,
  approved_by varchar(128),
  approved_at timestamptz,
  returned_reason varchar(1000),
  posted_journal_id uuid REFERENCES gigalibs_finance.gl_journals (id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_journal_drafts_posted CHECK ((status = 'POSTED') = (posted_journal_id IS NOT NULL AND approved_by IS NOT NULL)),
  CONSTRAINT gl_journal_drafts_submitted CHECK (status = 'DRAFT' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),
  CONSTRAINT gl_journal_drafts_second_person CHECK (approved_by IS NULL OR approved_by <> submitted_by)
);
CREATE INDEX gl_journal_drafts_book ON gigalibs_finance.gl_journal_drafts (tenant_id, accounting_book_id, status, posting_date);

CREATE TABLE gigalibs_finance.gl_journal_draft_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  draft_id uuid NOT NULL REFERENCES gigalibs_finance.gl_journal_drafts (id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  account_id uuid NOT NULL REFERENCES gigalibs_finance.chart_of_accounts (id) ON DELETE RESTRICT,
  debit_amount_minor bigint NOT NULL DEFAULT 0 CHECK (debit_amount_minor >= 0),
  credit_amount_minor bigint NOT NULL DEFAULT 0 CHECK (credit_amount_minor >= 0),
  memo varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_journal_draft_lines_number UNIQUE (draft_id, line_number),
  CONSTRAINT gl_journal_draft_lines_one_side CHECK ((debit_amount_minor > 0) <> (credit_amount_minor > 0))
);
CREATE INDEX gl_journal_draft_lines_draft ON gigalibs_finance.gl_journal_draft_lines (tenant_id, draft_id);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['record_idempotency', 'gl_journal_drafts', 'gl_journal_draft_lines']
  LOOP
    EXECUTE format('ALTER TABLE gigalibs_finance.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_finance.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_finance.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (9)
ON CONFLICT (version) DO NOTHING;

COMMIT;
