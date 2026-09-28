-- Migration 000011: AR Checkout Sessions, Payment Webhook Journal & PDF Storage Metadata
BEGIN;

-- ─── Checkout Sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_ar.checkout_sessions (
  tenant_id           uuid         NOT NULL,
  id                  uuid         NOT NULL,
  invoice_id          uuid         NOT NULL,
  provider            text         NOT NULL,
  provider_session_id text         NOT NULL,
  provider_url        text         NOT NULL,
  amount_minor        bigint       NOT NULL,
  currency            character(3) NOT NULL,
  status              text         NOT NULL DEFAULT 'OPEN',
  expires_at          timestamptz  NOT NULL,
  created_by          text         NOT NULL,
  created_at          timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  completed_at        timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT checkout_sessions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT checkout_sessions_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT checkout_sessions_provider_check CHECK (provider IN ('STRIPE', 'ADYEN')),
  CONSTRAINT checkout_sessions_status_check CHECK (status IN ('OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT checkout_sessions_amount_check CHECK (amount_minor > 0),
  CONSTRAINT checkout_sessions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT checkout_sessions_provider_session_unique UNIQUE (tenant_id, provider, provider_session_id)
);

CREATE INDEX IF NOT EXISTS checkout_sessions_invoice_idx
  ON gigalibs_ar.checkout_sessions (tenant_id, invoice_id, status);

ALTER TABLE gigalibs_ar.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.checkout_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY checkout_sessions_tenant_policy ON gigalibs_ar.checkout_sessions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Payment Webhook Journal ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_ar.payment_webhook_events (
  tenant_id           uuid         NOT NULL,
  id                  uuid         NOT NULL,
  provider            text         NOT NULL,
  event_id            text         NOT NULL,
  event_type          text         NOT NULL,
  payload             jsonb        NOT NULL,
  status              text         NOT NULL DEFAULT 'RECEIVED',
  processed_at        timestamptz,
  failure_reason      text,
  created_at          timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT payment_webhook_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT payment_webhook_provider_check CHECK (provider IN ('STRIPE', 'ADYEN')),
  CONSTRAINT payment_webhook_status_check CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')),
  CONSTRAINT payment_webhook_event_unique UNIQUE (tenant_id, provider, event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_lookup_idx
  ON gigalibs_ar.payment_webhook_events (tenant_id, provider, status);

ALTER TABLE gigalibs_ar.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.payment_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_webhook_events_tenant_policy ON gigalibs_ar.payment_webhook_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Storage Extension for PDF Renders ───────────────────────────────────────
ALTER TABLE gigalibs_ar.invoice_pdf_renders
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'DATABASE';

-- ─── Runtime Grants ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE
  gigalibs_ar.checkout_sessions,
  gigalibs_ar.payment_webhook_events
TO gigalibs_ar_api_runtime;

GRANT UPDATE ON TABLE gigalibs_ar.invoice_pdf_renders
TO gigalibs_ar_api_runtime;

-- ─── Schema Migration Record ─────────────────────────────────────────────────
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (11, '000011_ar_checkout_and_storage')
ON CONFLICT (version) DO NOTHING;

COMMIT;
