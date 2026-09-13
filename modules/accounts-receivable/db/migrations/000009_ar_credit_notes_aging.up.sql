-- Phase 5: Credit notes, aging view, and collections log.
--
-- Credit notes are immutable financial documents that reduce what a customer
-- owes against a specific issued invoice.  They are applied by recording a
-- payment_record of method CREDIT_NOTE (Phase 4) — the balance function
-- already picks those up.  This migration adds the credit-note document tables
-- and a collections log for reminder/escalation tracking.

BEGIN;

-- ─── Credit notes ─────────────────────────────────────────────────────────────

CREATE TABLE gigalibs_ar.credit_notes (
  tenant_id           uuid         NOT NULL,
  id                  uuid         NOT NULL,
  invoice_id          uuid         NOT NULL,   -- the invoice being credited
  credit_note_number  text         NOT NULL,
  currency            character(3) NOT NULL,
  reason              text         NOT NULL,
  issue_date          date         NOT NULL,
  subtotal_minor      bigint       NOT NULL,
  tax_minor           bigint       NOT NULL DEFAULT 0,
  total_minor         bigint       NOT NULL,
  issued_by           text         NOT NULL,
  issued_at           timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT credit_notes_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT credit_notes_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT credit_notes_number_unique UNIQUE (tenant_id, credit_note_number),
  CONSTRAINT credit_notes_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT credit_notes_reason_check CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT credit_notes_subtotal_check CHECK (subtotal_minor > 0),
  CONSTRAINT credit_notes_tax_check CHECK (tax_minor >= 0),
  CONSTRAINT credit_notes_total_check CHECK (total_minor = subtotal_minor + tax_minor),
  CONSTRAINT credit_notes_number_check CHECK (char_length(btrim(credit_note_number)) BETWEEN 1 AND 50),
  CONSTRAINT credit_notes_issued_by_check CHECK (char_length(issued_by) BETWEEN 1 AND 255)
);

CREATE INDEX credit_notes_invoice_idx
  ON gigalibs_ar.credit_notes (tenant_id, invoice_id, issued_at DESC);

-- Credit notes are immutable once created
CREATE FUNCTION gigalibs_ar.reject_credit_note_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'credit notes are immutable'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER credit_notes_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.credit_notes
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_credit_note_change();

CREATE TABLE gigalibs_ar.credit_note_lines (
  tenant_id           uuid         NOT NULL,
  id                  uuid         NOT NULL,
  credit_note_id      uuid         NOT NULL,
  position            integer      NOT NULL,
  description         text         NOT NULL,
  quantity            numeric(22, 6) NOT NULL,
  unit_amount_minor   bigint       NOT NULL,
  amount_minor        bigint       NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cn_lines_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT cn_lines_cn_fk FOREIGN KEY (tenant_id, credit_note_id)
    REFERENCES gigalibs_ar.credit_notes (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cn_lines_position_check CHECK (position >= 1),
  CONSTRAINT cn_lines_quantity_check CHECK (quantity > 0),
  CONSTRAINT cn_lines_unit_amount_check CHECK (unit_amount_minor >= 0),
  CONSTRAINT cn_lines_amount_check CHECK (amount_minor > 0),
  CONSTRAINT cn_lines_description_check CHECK (char_length(btrim(description)) BETWEEN 1 AND 500)
);

CREATE TRIGGER credit_note_lines_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.credit_note_lines
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_credit_note_change();

-- ─── Collections log ──────────────────────────────────────────────────────────
-- Append-only log of reminder / escalation / resolution events per invoice.
-- Does NOT live on the invoices table (immutable).

CREATE TABLE gigalibs_ar.collection_events (
  tenant_id   uuid         NOT NULL,
  id          uuid         NOT NULL,
  invoice_id  uuid         NOT NULL,
  event_type  text         NOT NULL,  -- REMINDER_SENT | ESCALATED | RESOLVED | NOTE_ADDED
  channel     text,                   -- EMAIL | PHONE | LETTER | PORTAL (for REMINDER_SENT)
  note        text,
  actor       text         NOT NULL,
  occurred_at timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT collection_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT collection_events_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT collection_events_type_check CHECK (
    event_type IN ('REMINDER_SENT', 'ESCALATED', 'RESOLVED', 'NOTE_ADDED')
  ),
  CONSTRAINT collection_events_channel_check CHECK (
    channel IS NULL OR channel IN ('EMAIL', 'PHONE', 'LETTER', 'PORTAL')
  ),
  CONSTRAINT collection_events_note_check CHECK (note IS NULL OR char_length(note) <= 2000),
  CONSTRAINT collection_events_actor_check CHECK (char_length(actor) BETWEEN 1 AND 255)
);

CREATE INDEX collection_events_invoice_idx
  ON gigalibs_ar.collection_events (tenant_id, invoice_id, occurred_at DESC);

CREATE INDEX collection_events_tenant_recent_idx
  ON gigalibs_ar.collection_events (tenant_id, occurred_at DESC);

-- Collection events are append-only
CREATE FUNCTION gigalibs_ar.reject_collection_event_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'collection events are append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER collection_events_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.collection_events
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_collection_event_change();

-- ─── Aging view ───────────────────────────────────────────────────────────────
-- Computes current balance and aging bucket for every issued, non-void invoice.
-- "current" means balance function is called inline — uses the Phase 4 indexes.

CREATE VIEW gigalibs_ar.invoice_aging AS
SELECT
  d.tenant_id,
  d.id                                          AS draft_id,
  i.id                                          AS invoice_id,
  i.invoice_number,
  d.customer_id,
  i.currency,
  i.total_minor,
  bal.amount_paid_minor,
  GREATEST(0, i.total_minor - bal.amount_paid_minor)::bigint
                                                AS amount_due_minor,
  i.due_date,
  (CURRENT_DATE - i.due_date)                   AS days_overdue,
  CASE
    WHEN bal.is_voided                                     THEN 'VOIDED'
    WHEN bal.amount_paid_minor >= i.total_minor            THEN 'PAID'
    WHEN CURRENT_DATE <= i.due_date                        THEN 'CURRENT'
    WHEN (CURRENT_DATE - i.due_date) BETWEEN 1 AND 30     THEN 'OVERDUE_1_30'
    WHEN (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60    THEN 'OVERDUE_31_60'
    WHEN (CURRENT_DATE - i.due_date) BETWEEN 61 AND 90    THEN 'OVERDUE_61_90'
    ELSE                                                       'OVERDUE_90_PLUS'
  END                                           AS aging_bucket
FROM gigalibs_ar.invoice_drafts d
JOIN gigalibs_ar.invoices i
  ON i.tenant_id = d.tenant_id AND i.id = d.issued_invoice_id
CROSS JOIN LATERAL gigalibs_ar.invoice_balance(d.tenant_id, i.id) bal
WHERE d.status = 'ISSUED';

GRANT SELECT ON gigalibs_ar.invoice_aging TO gigalibs_ar_api_runtime;

-- ─── Update invoice_balance to include credit notes ───────────────────────────
-- Credit notes reduce what's owed exactly like payments (they're recorded as
-- CREDIT_NOTE payment_records in Phase 4).  The balance function already
-- covers them via payment_records sum.  No change needed to the function.

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE gigalibs_ar.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.credit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_notes_tenant_policy ON gigalibs_ar.credit_notes
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.credit_note_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_note_lines_tenant_policy ON gigalibs_ar.credit_note_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.collection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.collection_events FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_events_tenant_policy ON gigalibs_ar.collection_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON TABLE
  gigalibs_ar.credit_notes,
  gigalibs_ar.credit_note_lines,
  gigalibs_ar.collection_events
TO gigalibs_ar_api_runtime;

-- ─── Schema version ──────────────────────────────────────────────────────────
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (9, '000009_ar_credit_notes_aging')
ON CONFLICT (version) DO NOTHING;

COMMIT;
