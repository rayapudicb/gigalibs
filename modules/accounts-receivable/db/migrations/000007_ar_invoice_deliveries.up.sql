-- Phase 3: Invoice PDF renders and email delivery tracking.
-- Rendered PDFs are stored as bytea in invoice_pdf_renders (migrated to
-- object storage in Phase 6).  invoice_deliveries is append-only to preserve
-- full send history.

BEGIN;

-- ─── PDF renders ─────────────────────────────────────────────────────────────
-- One row per rendered PDF version of an invoice.  Re-rendering (e.g. after
-- a billing-entity logo change) inserts a new row; the latest by rendered_at
-- is the canonical PDF.

CREATE TABLE gigalibs_ar.invoice_pdf_renders (
  tenant_id    uuid         NOT NULL,
  id           uuid         NOT NULL,
  invoice_id   uuid         NOT NULL,
  pdf_bytes    bytea        NOT NULL,
  byte_size    integer      NOT NULL,
  checksum_sha256 character(64) NOT NULL,
  rendered_by  text         NOT NULL,
  rendered_at  timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT pdf_renders_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT pdf_renders_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pdf_renders_byte_size_check CHECK (byte_size > 0),
  CONSTRAINT pdf_renders_checksum_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pdf_renders_rendered_by_check CHECK (char_length(rendered_by) BETWEEN 1 AND 255)
);

CREATE INDEX invoice_pdf_renders_invoice_idx
  ON gigalibs_ar.invoice_pdf_renders (tenant_id, invoice_id, rendered_at DESC);

ALTER TABLE gigalibs_ar.invoice_pdf_renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_pdf_renders FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_pdf_renders_tenant_policy ON gigalibs_ar.invoice_pdf_renders
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Delivery records ─────────────────────────────────────────────────────────
-- Append-only: each attempted send of an invoice to a recipient produces one
-- row.  status transitions: PENDING → SENT | FAILED.  This table is immutable
-- once status = 'SENT' (enforced by trigger below).

CREATE TABLE gigalibs_ar.invoice_deliveries (
  tenant_id        uuid         NOT NULL,
  id               uuid         NOT NULL,
  invoice_id       uuid         NOT NULL,
  pdf_render_id    uuid         NOT NULL,
  recipient_email  text         NOT NULL,
  recipient_name   text         NOT NULL,
  subject_line     text         NOT NULL,
  status           text         NOT NULL DEFAULT 'PENDING',
  failure_reason   text,
  sent_at          timestamptz,
  idempotency_key  text         NOT NULL,
  correlation_id   text         NOT NULL,
  delivered_by     text         NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT deliveries_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT deliveries_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT deliveries_render_fk FOREIGN KEY (tenant_id, pdf_render_id)
    REFERENCES gigalibs_ar.invoice_pdf_renders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT deliveries_status_check CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  CONSTRAINT deliveries_email_check CHECK (
    char_length(recipient_email) BETWEEN 3 AND 320 AND position('@' IN recipient_email) > 1
  ),
  CONSTRAINT deliveries_recipient_name_check CHECK (char_length(recipient_name) BETWEEN 1 AND 200),
  CONSTRAINT deliveries_subject_check CHECK (char_length(subject_line) BETWEEN 1 AND 998),
  CONSTRAINT deliveries_failure_check CHECK (
    (status = 'FAILED' AND failure_reason IS NOT NULL) OR
    (status != 'FAILED' AND failure_reason IS NULL)
  ),
  CONSTRAINT deliveries_sent_at_check CHECK (
    (status = 'SENT' AND sent_at IS NOT NULL) OR
    (status != 'SENT' AND sent_at IS NULL)
  ),
  CONSTRAINT deliveries_idempotency_check CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
  CONSTRAINT deliveries_correlation_check CHECK (char_length(correlation_id) BETWEEN 1 AND 200),
  CONSTRAINT deliveries_delivered_by_check CHECK (char_length(delivered_by) BETWEEN 1 AND 255)
);

-- Unique idempotency per invoice + key prevents duplicate sends
CREATE UNIQUE INDEX invoice_deliveries_idempotency_unique
  ON gigalibs_ar.invoice_deliveries (tenant_id, invoice_id, idempotency_key);

CREATE INDEX invoice_deliveries_invoice_idx
  ON gigalibs_ar.invoice_deliveries (tenant_id, invoice_id, created_at DESC);

ALTER TABLE gigalibs_ar.invoice_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_deliveries_tenant_policy ON gigalibs_ar.invoice_deliveries
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Immutability trigger on SENT deliveries ─────────────────────────────────

CREATE FUNCTION gigalibs_ar.reject_sent_delivery_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'SENT' THEN
    RAISE EXCEPTION 'a sent delivery record is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_deliveries_sent_immutable
  BEFORE UPDATE ON gigalibs_ar.invoice_deliveries
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_sent_delivery_change();

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON TABLE
  gigalibs_ar.invoice_pdf_renders,
  gigalibs_ar.invoice_deliveries
TO gigalibs_ar_api_runtime;

-- Deliveries need UPDATE so we can transition PENDING → SENT | FAILED
GRANT UPDATE ON TABLE gigalibs_ar.invoice_deliveries TO gigalibs_ar_api_runtime;

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (7, '000007_ar_invoice_deliveries');

COMMIT;
