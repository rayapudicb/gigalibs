BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_ar;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_ar_api_runtime') THEN
    CREATE ROLE gigalibs_ar_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

CREATE TABLE gigalibs_ar.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

CREATE TABLE gigalibs_ar.module_tenants (
  id uuid PRIMARY KEY,
  oidc_issuer text NOT NULL,
  external_tenant_subject text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

CREATE TABLE gigalibs_ar.billing_entities (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  legal_name text NOT NULL,
  legal_identifier text,
  default_currency character(3) NOT NULL,
  locale text NOT NULL,
  time_zone text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT billing_entities_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT billing_entities_name_check CHECK (char_length(btrim(legal_name)) BETWEEN 1 AND 200),
  CONSTRAINT billing_entities_currency_check CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT billing_entities_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX billing_entities_legal_identifier_unique
  ON gigalibs_ar.billing_entities (tenant_id, legal_identifier)
  WHERE legal_identifier IS NOT NULL;

CREATE TABLE gigalibs_ar.invoice_series (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  billing_entity_id uuid NOT NULL,
  code text NOT NULL,
  prefix text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  next_value bigint NOT NULL DEFAULT 1,
  padding smallint NOT NULL DEFAULT 6,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoice_series_billing_entity_fk FOREIGN KEY (tenant_id, billing_entity_id)
    REFERENCES gigalibs_ar.billing_entities (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_series_code_unique UNIQUE (tenant_id, billing_entity_id, code),
  CONSTRAINT invoice_series_code_check CHECK (code ~ '^[A-Z0-9_-]{1,40}$'),
  CONSTRAINT invoice_series_prefix_check CHECK (prefix ~ '^[A-Z0-9-]{0,20}$'),
  CONSTRAINT invoice_series_next_check CHECK (next_value BETWEEN 1 AND 999999999999),
  CONSTRAINT invoice_series_padding_check CHECK (padding BETWEEN 1 AND 12),
  CONSTRAINT invoice_series_version_check CHECK (version > 0)
);

CREATE TABLE gigalibs_ar.customers (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  legal_name text NOT NULL,
  billing_email text NOT NULL,
  external_reference text,
  currency character(3) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT customers_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT customers_name_check CHECK (char_length(btrim(legal_name)) BETWEEN 1 AND 200),
  CONSTRAINT customers_email_check CHECK (
    char_length(billing_email) BETWEEN 3 AND 320 AND position('@' IN billing_email) > 1
  ),
  CONSTRAINT customers_external_reference_check CHECK (
    external_reference IS NULL OR char_length(external_reference) BETWEEN 1 AND 100
  ),
  CONSTRAINT customers_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT customers_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT customers_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX customers_external_reference_unique
  ON gigalibs_ar.customers (tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX customers_list_idx
  ON gigalibs_ar.customers (tenant_id, status, legal_name, id);

CREATE UNIQUE INDEX invoice_series_one_default_per_entity
  ON gigalibs_ar.invoice_series (tenant_id, billing_entity_id)
  WHERE is_default;

CREATE TABLE gigalibs_ar.invoice_drafts (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  billing_entity_id uuid NOT NULL,
  invoice_series_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  currency character(3) NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  purchase_order_reference text,
  status text NOT NULL DEFAULT 'DRAFT',
  subtotal_minor bigint NOT NULL,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL,
  version integer NOT NULL DEFAULT 1,
  issued_invoice_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoice_drafts_billing_entity_fk FOREIGN KEY (tenant_id, billing_entity_id)
    REFERENCES gigalibs_ar.billing_entities (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_drafts_series_fk FOREIGN KEY (tenant_id, invoice_series_id)
    REFERENCES gigalibs_ar.invoice_series (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_drafts_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES gigalibs_ar.customers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_drafts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT invoice_drafts_date_check CHECK (due_date >= issue_date),
  CONSTRAINT invoice_drafts_po_check CHECK (
    purchase_order_reference IS NULL OR char_length(purchase_order_reference) BETWEEN 1 AND 100
  ),
  CONSTRAINT invoice_drafts_status_check CHECK (status IN ('DRAFT', 'ISSUED')),
  CONSTRAINT invoice_drafts_amounts_check CHECK (
    subtotal_minor >= 0 AND tax_minor >= 0 AND total_minor = subtotal_minor + tax_minor
  ),
  CONSTRAINT invoice_drafts_foundation_tax_check CHECK (tax_minor = 0),
  CONSTRAINT invoice_drafts_version_check CHECK (version > 0),
  CONSTRAINT invoice_drafts_issued_link_check CHECK (
    (status = 'DRAFT' AND issued_invoice_id IS NULL) OR
    (status = 'ISSUED' AND issued_invoice_id IS NOT NULL)
  )
);

CREATE INDEX invoice_drafts_list_idx
  ON gigalibs_ar.invoice_drafts (tenant_id, status, updated_at DESC, id);
CREATE INDEX invoice_drafts_customer_idx
  ON gigalibs_ar.invoice_drafts (tenant_id, customer_id, updated_at DESC);

CREATE TABLE gigalibs_ar.invoice_draft_lines (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  draft_id uuid NOT NULL,
  position integer NOT NULL,
  description text NOT NULL,
  quantity numeric(20, 6) NOT NULL,
  unit_amount_minor bigint NOT NULL,
  amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoice_draft_lines_draft_fk FOREIGN KEY (tenant_id, draft_id)
    REFERENCES gigalibs_ar.invoice_drafts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT invoice_draft_lines_position_unique UNIQUE (tenant_id, draft_id, position),
  CONSTRAINT invoice_draft_lines_position_check CHECK (position BETWEEN 1 AND 500),
  CONSTRAINT invoice_draft_lines_description_check CHECK (
    char_length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT invoice_draft_lines_quantity_check CHECK (quantity > 0),
  CONSTRAINT invoice_draft_lines_amount_check CHECK (unit_amount_minor >= 0 AND amount_minor >= 0)
);

CREATE TABLE gigalibs_ar.invoices (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  source_draft_id uuid NOT NULL,
  billing_entity_id uuid NOT NULL,
  invoice_series_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_number text NOT NULL,
  currency character(3) NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  purchase_order_reference text,
  seller_snapshot jsonb NOT NULL,
  buyer_snapshot jsonb NOT NULL,
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  total_minor bigint NOT NULL,
  issued_by text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoices_source_draft_unique UNIQUE (tenant_id, source_draft_id),
  CONSTRAINT invoices_number_unique UNIQUE (
    tenant_id, billing_entity_id, invoice_series_id, invoice_number
  ),
  CONSTRAINT invoices_draft_fk FOREIGN KEY (tenant_id, source_draft_id)
    REFERENCES gigalibs_ar.invoice_drafts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoices_billing_entity_fk FOREIGN KEY (tenant_id, billing_entity_id)
    REFERENCES gigalibs_ar.billing_entities (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoices_series_fk FOREIGN KEY (tenant_id, invoice_series_id)
    REFERENCES gigalibs_ar.invoice_series (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoices_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES gigalibs_ar.customers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT invoices_date_check CHECK (due_date >= issue_date),
  CONSTRAINT invoices_number_check CHECK (char_length(invoice_number) BETWEEN 1 AND 40),
  CONSTRAINT invoices_snapshots_check CHECK (
    jsonb_typeof(seller_snapshot) = 'object' AND
    jsonb_typeof(buyer_snapshot) = 'object' AND
    jsonb_typeof(terms_snapshot) = 'object'
  ),
  CONSTRAINT invoices_amounts_check CHECK (
    subtotal_minor >= 0 AND tax_minor >= 0 AND total_minor = subtotal_minor + tax_minor
  ),
  CONSTRAINT invoices_foundation_tax_check CHECK (tax_minor = 0)
);

ALTER TABLE gigalibs_ar.invoice_drafts
  ADD CONSTRAINT invoice_drafts_issued_invoice_fk
  FOREIGN KEY (tenant_id, issued_invoice_id)
  REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX invoices_list_idx
  ON gigalibs_ar.invoices (tenant_id, issued_at DESC, id);
CREATE INDEX invoices_customer_idx
  ON gigalibs_ar.invoices (tenant_id, customer_id, issue_date DESC, id);
CREATE INDEX invoices_due_idx
  ON gigalibs_ar.invoices (tenant_id, due_date, id);

CREATE TABLE gigalibs_ar.invoice_lines (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  position integer NOT NULL,
  description text NOT NULL,
  quantity numeric(20, 6) NOT NULL,
  unit_amount_minor bigint NOT NULL,
  amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoice_lines_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_lines_position_unique UNIQUE (tenant_id, invoice_id, position),
  CONSTRAINT invoice_lines_position_check CHECK (position BETWEEN 1 AND 500),
  CONSTRAINT invoice_lines_description_check CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT invoice_lines_quantity_check CHECK (quantity > 0),
  CONSTRAINT invoice_lines_amount_check CHECK (unit_amount_minor >= 0 AND amount_minor >= 0)
);

CREATE TABLE gigalibs_ar.idempotency_records (
  tenant_id uuid NOT NULL,
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash character(64) NOT NULL,
  response_status smallint NOT NULL,
  response_body jsonb NOT NULL,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz,
  PRIMARY KEY (tenant_id, scope, idempotency_key),
  CONSTRAINT idempotency_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT idempotency_scope_check CHECK (char_length(scope) BETWEEN 1 AND 100),
  CONSTRAINT idempotency_key_check CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
  CONSTRAINT idempotency_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT idempotency_status_check CHECK (response_status BETWEEN 200 AND 299),
  CONSTRAINT idempotency_body_check CHECK (jsonb_typeof(response_body) = 'object')
);

CREATE INDEX idempotency_expiry_idx
  ON gigalibs_ar.idempotency_records (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE gigalibs_ar.audit_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  action text NOT NULL,
  actor_subject text NOT NULL,
  actor_permissions text[] NOT NULL DEFAULT '{}',
  reason text,
  prior_state jsonb,
  new_state jsonb NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT audit_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT audit_aggregate_type_check CHECK (char_length(aggregate_type) BETWEEN 1 AND 80),
  CONSTRAINT audit_action_check CHECK (char_length(action) BETWEEN 1 AND 100),
  CONSTRAINT audit_actor_check CHECK (char_length(actor_subject) BETWEEN 1 AND 255),
  CONSTRAINT audit_reason_check CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT audit_new_state_check CHECK (jsonb_typeof(new_state) = 'object'),
  CONSTRAINT audit_prior_state_check CHECK (
    prior_state IS NULL OR jsonb_typeof(prior_state) = 'object'
  )
);

CREATE INDEX audit_aggregate_timeline_idx
  ON gigalibs_ar.audit_events (tenant_id, aggregate_type, aggregate_id, occurred_at, id);

CREATE TABLE gigalibs_ar.outbox_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  subject text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_error_code text,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT outbox_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT outbox_event_type_check CHECK (char_length(event_type) BETWEEN 1 AND 160),
  CONSTRAINT outbox_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_attempt_check CHECK (attempt_count >= 0),
  CONSTRAINT outbox_publish_state_check CHECK (
    published_at IS NULL OR published_at >= occurred_at
  )
);

CREATE INDEX outbox_pending_idx
  ON gigalibs_ar.outbox_events (next_attempt_at, occurred_at, tenant_id, id)
  WHERE published_at IS NULL;

CREATE FUNCTION gigalibs_ar.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable AR record cannot be changed'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER invoices_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.invoices
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_immutable_change();
CREATE TRIGGER invoice_lines_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_immutable_change();
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_ar.audit_events
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.reject_immutable_change();

ALTER TABLE gigalibs_ar.module_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.module_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY module_tenants_tenant_policy ON gigalibs_ar.module_tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.billing_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.billing_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_entities_tenant_policy ON gigalibs_ar.billing_entities
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_series FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_series_tenant_policy ON gigalibs_ar.invoice_series
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_policy ON gigalibs_ar.customers
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_drafts_tenant_policy ON gigalibs_ar.invoice_drafts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.invoice_draft_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_draft_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_draft_lines_tenant_policy ON gigalibs_ar.invoice_draft_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant_policy ON gigalibs_ar.invoices
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_tenant_policy ON gigalibs_ar.invoice_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_records_tenant_policy ON gigalibs_ar.idempotency_records
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_policy ON gigalibs_ar.audit_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gigalibs_ar.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_policy ON gigalibs_ar.outbox_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT USAGE ON SCHEMA gigalibs_ar TO gigalibs_ar_api_runtime;
GRANT SELECT ON TABLE gigalibs_ar.schema_migrations TO gigalibs_ar_api_runtime;
GRANT SELECT, INSERT ON TABLE
  gigalibs_ar.module_tenants,
  gigalibs_ar.billing_entities,
  gigalibs_ar.customers,
  gigalibs_ar.invoices,
  gigalibs_ar.invoice_lines,
  gigalibs_ar.idempotency_records
TO gigalibs_ar_api_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE
  gigalibs_ar.invoice_series,
  gigalibs_ar.invoice_drafts
TO gigalibs_ar_api_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE
  gigalibs_ar.invoice_draft_lines
TO gigalibs_ar_api_runtime;
GRANT INSERT ON TABLE
  gigalibs_ar.audit_events,
  gigalibs_ar.outbox_events
TO gigalibs_ar_api_runtime;

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (1, '000001_ar_foundation');

COMMIT;
