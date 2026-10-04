-- Migration: 000001_finance_general_ledger_foundation.up.sql
-- Module: financial-operations (WI-OI-094)
-- Purpose: Schema gigalibs_finance with multi-book accounting schemas, hierarchical chart of accounts,
--          fiscal periods with lockout controls, immutable double-entry general ledger journal facts,
--          Delta-5 durable outbox-inbox relay, strict RLS, and tamper-proof triggers.

BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_finance;

-- 1. Schema migrations table
CREATE TABLE IF NOT EXISTS gigalibs_finance.schema_migrations (
    version BIGINT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;

-- 2. Organization replica tables (required by OrganizationReplica in @gigalibs/module-sdk)
CREATE TABLE IF NOT EXISTS gigalibs_finance.org_replica_versions (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  tree_id VARCHAR(64) NOT NULL,
  tree_kind VARCHAR(16) NOT NULL CHECK (tree_kind IN ('PRIMARY','ALTERNATE')),
  version_number INT NOT NULL CHECK (version_number > 0),
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING','READY')),
  unit_count INT CHECK (unit_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS gigalibs_finance.org_replica_units (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  unit_id VARCHAR(64) NOT NULL,
  parent_unit_id VARCHAR(64),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL CHECK (sort_order >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  holds_records BOOLEAN NOT NULL,
  type_code VARCHAR(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_finance.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE IF NOT EXISTS gigalibs_finance.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_finance.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS finance_org_descendant ON gigalibs_finance.org_replica_closure (tenant_id, version_id, descendant_unit_id);

-- 3. Audit and Auth Revocation events
CREATE TABLE IF NOT EXISTS gigalibs_finance.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gigalibs_finance.auth_revocation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    token_id VARCHAR(128) NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255)
);

-- 4. Outbox events (Delta-5 relay standard)
CREATE TABLE IF NOT EXISTS gigalibs_finance.outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  topic VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(128) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  causation_id VARCHAR(128),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);

CREATE INDEX IF NOT EXISTS finance_outbox_events_delivery ON gigalibs_finance.outbox_events (status, available_at, created_at);

-- 5. Inbox receipts (deduplication)
CREATE TABLE IF NOT EXISTS gigalibs_finance.inbox_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source_module VARCHAR(64) NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  processed_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS finance_inbox_receipts_tenant_consumer ON gigalibs_finance.inbox_receipts (tenant_id, consumer_name);

-- 6. FIFO relay lease and settle functions
CREATE OR REPLACE FUNCTION gigalibs_finance.relay_lease_finance_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_finance.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  UPDATE gigalibs_finance.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_finance.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_finance.relay_settle_finance_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  UPDATE gigalibs_finance.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id
$$;

-- 7. Accounting Books (C_AcctSchema equivalent)
CREATE TABLE IF NOT EXISTS gigalibs_finance.accounting_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    book_code VARCHAR(50) NOT NULL,
    book_name VARCHAR(200) NOT NULL,
    legal_entity_party_id UUID NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    costing_method VARCHAR(20) NOT NULL DEFAULT 'STANDARD' CHECK (costing_method IN ('STANDARD', 'FIFO', 'AVERAGE')),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_accounting_books_code UNIQUE (tenant_id, book_code)
);

-- 8. Chart of Accounts (C_ElementValue equivalent)
CREATE TABLE IF NOT EXISTS gigalibs_finance.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_class VARCHAR(20) NOT NULL CHECK (account_class IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    account_subtype VARCHAR(30) NOT NULL,
    normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    parent_account_id UUID REFERENCES gigalibs_finance.chart_of_accounts(id) ON DELETE RESTRICT,
    is_reconcilable BOOLEAN NOT NULL DEFAULT false,
    is_subledger_control BOOLEAN NOT NULL DEFAULT false,
    is_system_reserved BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_coa_code UNIQUE (tenant_id, accounting_book_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_coa_parent ON gigalibs_finance.chart_of_accounts (tenant_id, parent_account_id);
CREATE INDEX IF NOT EXISTS idx_coa_class ON gigalibs_finance.chart_of_accounts (tenant_id, accounting_book_id, account_class);

-- 9. Fiscal Years & Fiscal Periods (C_Year & C_PeriodControl equivalent)
CREATE TABLE IF NOT EXISTS gigalibs_finance.fiscal_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    year_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('FUTURE', 'OPEN', 'SOFT_CLOSED', 'LOCKED')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fiscal_years UNIQUE (tenant_id, accounting_book_id, year_name),
    CHECK (start_date < end_date)
);

CREATE TABLE IF NOT EXISTS gigalibs_finance.fiscal_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    fiscal_year_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_years(id) ON DELETE CASCADE,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE CASCADE,
    period_number INT NOT NULL CHECK (period_number BETWEEN 1 AND 13),
    period_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('FUTURE', 'OPEN', 'SOFT_CLOSED', 'LOCKED')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fiscal_periods UNIQUE (tenant_id, fiscal_year_id, period_number),
    CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_periods_date_lookup ON gigalibs_finance.fiscal_periods (tenant_id, accounting_book_id, start_date, end_date);

-- 10. General Ledger Journals (GL Header)
CREATE TABLE IF NOT EXISTS gigalibs_finance.gl_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    journal_number VARCHAR(64) NOT NULL,
    accounting_book_id UUID NOT NULL REFERENCES gigalibs_finance.accounting_books(id) ON DELETE RESTRICT,
    fiscal_period_id UUID NOT NULL REFERENCES gigalibs_finance.fiscal_periods(id) ON DELETE RESTRICT,
    posting_date DATE NOT NULL,
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('STANDARD_MANUAL', 'SUBLEDGER_AP', 'SUBLEDGER_AR', 'SUBLEDGER_INVENTORY', 'REVERSAL', 'YEAR_END_CLOSE', 'OPENING_BALANCE')),
    source_document_type VARCHAR(50),
    source_document_id VARCHAR(128),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
    total_debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_debit_minor >= 0),
    total_credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_credit_minor >= 0),
    reversed_journal_id UUID REFERENCES gigalibs_finance.gl_journals(id),
    posted_at TIMESTAMPTZ,
    posted_by VARCHAR(64),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gl_journals_number UNIQUE (tenant_id, journal_number),
    CONSTRAINT chk_journal_totals_balanced CHECK (total_debit_minor = total_credit_minor)
);

CREATE INDEX IF NOT EXISTS idx_journals_book_period ON gigalibs_finance.gl_journals (tenant_id, accounting_book_id, fiscal_period_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_journals_source_doc ON gigalibs_finance.gl_journals (tenant_id, source_document_type, source_document_id);

-- 11. General Ledger Journal Lines (Fact_Acct equivalent)
CREATE TABLE IF NOT EXISTS gigalibs_finance.gl_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    journal_id UUID NOT NULL REFERENCES gigalibs_finance.gl_journals(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL REFERENCES gigalibs_finance.chart_of_accounts(id) ON DELETE RESTRICT,
    debit_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_amount_minor >= 0),
    credit_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount_minor >= 0),
    currency_code VARCHAR(3) NOT NULL,
    exchange_rate NUMERIC(16, 6) NOT NULL DEFAULT 1.000000 CHECK (exchange_rate > 0),
    base_debit_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_debit_amount_minor >= 0),
    base_credit_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_credit_amount_minor >= 0),
    memo TEXT,
    dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_journal_line UNIQUE (journal_id, line_number),
    CHECK (debit_amount_minor > 0 OR credit_amount_minor > 0),
    CHECK (debit_amount_minor = 0 OR credit_amount_minor = 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON gigalibs_finance.gl_journal_lines (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON gigalibs_finance.gl_journal_lines (tenant_id, journal_id);

-- 12. Period Lockout Enforcement Trigger
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_verify_period_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_period_status VARCHAR(20);
BEGIN
  SELECT status INTO v_period_status
  FROM gigalibs_finance.fiscal_periods
  WHERE id = NEW.fiscal_period_id;

  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Fiscal period % not found', NEW.fiscal_period_id;
  END IF;

  IF v_period_status = 'LOCKED' THEN
    RAISE EXCEPTION 'Cannot post journal into a LOCKED fiscal period (period_id=%)', NEW.fiscal_period_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verify_period_lock
BEFORE INSERT OR UPDATE OF fiscal_period_id, status, posting_date ON gigalibs_finance.gl_journals
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_verify_period_lock();

-- 13. Immutability Enforcements: No update/delete of posted journal lines
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_gl_journal_lines_immutable()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_status VARCHAR(20);
BEGIN
  SELECT status INTO v_journal_status
  FROM gigalibs_finance.gl_journals
  WHERE id = COALESCE(OLD.journal_id, NEW.journal_id);

  IF v_journal_status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Cannot modify or delete lines of a posted/reversed GL journal (journal_id=%)', COALESCE(OLD.journal_id, NEW.journal_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gl_journal_lines_immutable
BEFORE UPDATE OR DELETE ON gigalibs_finance.gl_journal_lines
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_gl_journal_lines_immutable();

-- 14. Immutability Enforcements: No delete or invalid modification of posted journal headers
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_gl_journal_header_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Cannot delete a posted or reversed GL journal (journal_id=%)', OLD.id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED' THEN
      -- Permitted: transitioning to REVERSED via reverseCorrectIt counter-document
      RETURN NEW;
    ELSIF OLD.status IN ('POSTED', 'REVERSED') THEN
      IF OLD.total_debit_minor <> NEW.total_debit_minor OR
         OLD.total_credit_minor <> NEW.total_credit_minor OR
         OLD.fiscal_period_id <> NEW.fiscal_period_id OR
         OLD.posting_date <> NEW.posting_date OR
         OLD.accounting_book_id <> NEW.accounting_book_id THEN
        RAISE EXCEPTION 'Cannot modify posted GL journal financials or periods (journal_id=%)', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gl_journal_header_immutable
BEFORE UPDATE OR DELETE ON gigalibs_finance.gl_journals
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_gl_journal_header_immutable();

-- 15. Double-Entry Balance Verification Constraint Trigger
CREATE OR REPLACE FUNCTION gigalibs_finance.fn_verify_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_sum_debit BIGINT;
  v_sum_credit BIGINT;
BEGIN
  IF NEW.status IN ('POSTED', 'REVERSED') THEN
    SELECT COALESCE(SUM(base_debit_amount_minor), 0), COALESCE(SUM(base_credit_amount_minor), 0)
      INTO v_sum_debit, v_sum_credit
      FROM gigalibs_finance.gl_journal_lines
     WHERE journal_id = NEW.id;

    IF v_sum_debit <> v_sum_credit THEN
      RAISE EXCEPTION 'GL Journal % is out of balance: total base debits (%) <> total base credits (%)', NEW.id, v_sum_debit, v_sum_credit;
    END IF;

    IF v_sum_debit <> NEW.total_debit_minor THEN
      RAISE EXCEPTION 'GL Journal % header total (%) does not match line sum (%)', NEW.id, NEW.total_debit_minor, v_sum_debit;
    END IF;

    IF v_sum_debit <= 0 THEN
      RAISE EXCEPTION 'GL Journal % must have positive debit/credit totals', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_verify_journal_balance
AFTER INSERT OR UPDATE ON gigalibs_finance.gl_journals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.fn_verify_journal_balance();

-- 16. Row-Level Security
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'accounting_books',
    'chart_of_accounts',
    'fiscal_years',
    'fiscal_periods',
    'gl_journals',
    'gl_journal_lines',
    'outbox_events',
    'inbox_receipts',
    'audit_events',
    'auth_revocation_events'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_finance.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format('ALTER TABLE gigalibs_finance.%I FORCE ROW LEVEL SECURITY', rel);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_finance.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      rel || '_tenant_isolation',
      rel
    );
  END LOOP;
END $$;

COMMIT;
