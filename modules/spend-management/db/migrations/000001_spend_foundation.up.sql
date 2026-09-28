BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_spend;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_spend_api_runtime') THEN
    CREATE ROLE gigalibs_spend_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS gigalibs_spend.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT spend_schema_migrations_version_check CHECK (version > 0),
  CONSTRAINT spend_schema_migrations_name_check CHECK (char_length(name) BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.module_tenants (
  id uuid PRIMARY KEY,
  oidc_issuer text NOT NULL,
  external_tenant_subject text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT spend_module_tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT spend_module_tenants_oidc_identity_unique UNIQUE (oidc_issuer, external_tenant_subject)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.cost_centers (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  manager_name text NOT NULL,
  manager_email text NOT NULL,
  currency character(3) NOT NULL DEFAULT 'USD',
  allocated_budget_minor bigint NOT NULL,
  committed_budget_minor bigint NOT NULL DEFAULT 0,
  spent_budget_minor bigint NOT NULL DEFAULT 0,
  fiscal_year integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cost_centers_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT cost_centers_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT cost_centers_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT cost_centers_budget_check CHECK (allocated_budget_minor >= 0 AND spent_budget_minor >= 0),
  CONSTRAINT cost_centers_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.expenses (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  cost_center_id uuid NOT NULL,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  merchant text NOT NULL,
  category text NOT NULL,
  payment_method text NOT NULL DEFAULT 'CORPORATE_CARD',
  currency character(3) NOT NULL DEFAULT 'USD',
  amount_minor bigint NOT NULL,
  tax_minor bigint NOT NULL DEFAULT 0,
  receipt_url text,
  receipt_filename text,
  status text NOT NULL DEFAULT 'SUBMITTED',
  policy_violation_flag boolean NOT NULL DEFAULT false,
  policy_violation_notes text,
  approver_name text,
  approved_at timestamptz,
  reimbursed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT expenses_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT expenses_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES gigalibs_spend.cost_centers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expenses_status_check CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REIMBURSED', 'REJECTED')),
  CONSTRAINT expenses_amount_check CHECK (amount_minor > 0),
  CONSTRAINT expenses_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expenses_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.expense_lines (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  expense_id uuid NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  gl_code text NOT NULL,
  amount_minor bigint NOT NULL,
  tax_minor bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT expense_lines_expense_fk FOREIGN KEY (tenant_id, expense_id)
    REFERENCES gigalibs_spend.expenses (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_lines_amount_check CHECK (amount_minor > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.travel_requests (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  cost_center_id uuid NOT NULL,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  destination_city text NOT NULL,
  destination_country text NOT NULL DEFAULT 'US',
  departure_date date NOT NULL,
  return_date date NOT NULL,
  gsa_city_tier text NOT NULL DEFAULT 'TIER_2',
  per_diem_daily_rate_minor bigint NOT NULL,
  lodging_ceiling_daily_minor bigint NOT NULL,
  estimated_total_minor bigint NOT NULL,
  actual_spend_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'SUBMITTED',
  business_purpose text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT travel_requests_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT travel_requests_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES gigalibs_spend.cost_centers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT travel_requests_status_check CHECK (status IN ('SUBMITTED', 'APPROVED', 'ACTIVE', 'CONCLUDED', 'CANCELLED')),
  CONSTRAINT travel_requests_dates_check CHECK (return_date >= departure_date),
  CONSTRAINT travel_requests_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.imprest_wallets (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  wallet_name text NOT NULL,
  custodian_name text NOT NULL,
  custodian_email text NOT NULL,
  currency character(3) NOT NULL DEFAULT 'USD',
  target_balance_minor bigint NOT NULL,
  current_balance_minor bigint NOT NULL,
  low_balance_threshold_minor bigint NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT imprest_wallets_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT imprest_wallets_status_check CHECK (status IN ('ACTIVE', 'REPLENISHMENT_PENDING', 'AUDIT_HOLD', 'CLOSED')),
  CONSTRAINT imprest_wallets_balance_check CHECK (target_balance_minor > 0 AND current_balance_minor >= 0),
  CONSTRAINT imprest_wallets_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.imprest_transactions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  voucher_number text NOT NULL,
  transaction_type text NOT NULL,
  recipient_name text NOT NULL,
  amount_minor bigint NOT NULL,
  balance_after_minor bigint NOT NULL,
  purpose text NOT NULL,
  receipt_attached boolean NOT NULL DEFAULT true,
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT imprest_tx_wallet_fk FOREIGN KEY (tenant_id, wallet_id)
    REFERENCES gigalibs_spend.imprest_wallets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT imprest_tx_type_check CHECK (transaction_type IN ('DISBURSEMENT', 'REPLENISHMENT', 'AUDIT_ADJUSTMENT')),
  CONSTRAINT imprest_tx_amount_check CHECK (amount_minor > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.saas_subscriptions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  vendor_name text NOT NULL,
  category text NOT NULL,
  cost_center_id uuid NOT NULL,
  owner_email text NOT NULL,
  billing_frequency text NOT NULL DEFAULT 'ANNUAL',
  seats_allocated integer NOT NULL DEFAULT 1,
  seats_utilized integer NOT NULL DEFAULT 1,
  cost_per_seat_minor bigint NOT NULL DEFAULT 0,
  annual_run_rate_minor bigint NOT NULL,
  renewal_date date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  auto_renew boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT saas_subscriptions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT saas_subscriptions_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES gigalibs_spend.cost_centers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT saas_subscriptions_status_check CHECK (status IN ('ACTIVE', 'RENEWAL_REVIEW', 'CANCELLATION_PENDING', 'TERMINATED')),
  CONSTRAINT saas_subscriptions_frequency_check CHECK (billing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
  CONSTRAINT saas_subscriptions_run_rate_check CHECK (annual_run_rate_minor >= 0),
  CONSTRAINT saas_subscriptions_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.approval_rules (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  rule_name text NOT NULL,
  min_amount_minor bigint NOT NULL,
  max_amount_minor bigint,
  requires_executive_signoff boolean NOT NULL DEFAULT false,
  required_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT approval_rules_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.audit_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT audit_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gigalibs_spend.outbox_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT outbox_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_spend.module_tenants (id) ON DELETE RESTRICT
);

INSERT INTO gigalibs_spend.schema_migrations (version, name)
VALUES (1, '000001_spend_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
