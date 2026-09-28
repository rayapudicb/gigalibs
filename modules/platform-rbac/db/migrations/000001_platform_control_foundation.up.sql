CREATE SCHEMA IF NOT EXISTS gigalibs_platform;

-- Platform Master Tenants Fleet
CREATE TABLE IF NOT EXISTS gigalibs_platform.platform_tenants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  subdomain VARCHAR(64) NOT NULL UNIQUE,
  custom_domain VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, PROVISIONING
  plan_tier VARCHAR(64) NOT NULL DEFAULT 'ENTERPRISE',
  entitled_modules TEXT[] NOT NULL DEFAULT '{}',
  primary_contact_email VARCHAR(255) NOT NULL,
  allocated_schemas TEXT[] NOT NULL DEFAULT '{}',
  storage_usage_bytes BIGINT NOT NULL DEFAULT 0,
  max_user_seats INT NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform Super Admins and Staff
CREATE TABLE IF NOT EXISTS gigalibs_platform.platform_users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  platform_role VARCHAR(64) NOT NULL DEFAULT 'SUPER_ADMIN', -- SUPER_ADMIN, OPERATIONS, SECURITY_OFFICER, BILLING_AUDITOR
  mfa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global Platform Settings Store
CREATE TABLE IF NOT EXISTS gigalibs_platform.platform_settings (
  key VARCHAR(128) PRIMARY KEY,
  value JSONB NOT NULL,
  category VARCHAR(64) NOT NULL, -- SYSTEM, SECURITY, EGRESS, FEATURE_FLAGS, BILLING
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(128) NOT NULL DEFAULT 'PLATFORM_SUPER_ADMIN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Certified Enterprise Module Catalog
CREATE TABLE IF NOT EXISTS gigalibs_platform.module_catalog (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL,
  monthly_price_usd NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(64) NOT NULL,
  badge VARCHAR(64),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  is_core BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Progressive Subscription Plans Catalog (with Included User Seats)
CREATE TABLE IF NOT EXISTS gigalibs_platform.subscription_plans (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tagline TEXT,
  monthly_price_usd NUMERIC(10, 2) NOT NULL,
  included_user_seats INT NOT NULL DEFAULT 25,
  entitled_modules TEXT[] NOT NULL DEFAULT '{}',
  included_quotas JSONB NOT NULL DEFAULT '{}',
  badge VARCHAR(64),
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Metering Dimensions & Capability Rates
CREATE TABLE IF NOT EXISTS gigalibs_platform.metering_dimensions (
  dimension_code VARCHAR(64) PRIMARY KEY,
  module_code VARCHAR(64) NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  unit_name VARCHAR(64) NOT NULL,
  included_monthly_units BIGINT NOT NULL DEFAULT 0,
  overage_unit_price_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  metering_type VARCHAR(64) NOT NULL DEFAULT 'CONSUMPTION_DEBIT',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Corporate Invoices (Self-Service & Contractual)
CREATE TABLE IF NOT EXISTS gigalibs_platform.billing_invoices (
  id VARCHAR(64) PRIMARY KEY,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  total_usd NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(64) NOT NULL DEFAULT 'CORPORATE_INVOICED_LEDGER',
  status VARCHAR(32) NOT NULL DEFAULT 'PAID', -- PAID, PENDING, VOID
  invoice_pdf_hash VARCHAR(64),
  line_items JSONB NOT NULL DEFAULT '[]',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Module Purchases Ledger
CREATE TABLE IF NOT EXISTS gigalibs_platform.module_purchases (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  module_code VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.module_catalog(code),
  invoice_id VARCHAR(64) REFERENCES gigalibs_platform.billing_invoices(id),
  billing_cycle VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
  amount_usd NUMERIC(10, 2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'SETTLED',
  purchased_by VARCHAR(255) NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Double-Entry Financial & Billing Ledger
CREATE TABLE IF NOT EXISTS gigalibs_platform.ledger_transactions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  reference_type VARCHAR(64) NOT NULL, -- MODULE_PURCHASE, USAGE_OVERAGE, PLATFORM_CREDIT
  reference_id VARCHAR(64) NOT NULL,
  debit_account VARCHAR(64) NOT NULL,
  credit_account VARCHAR(64) NOT NULL,
  amount_usd NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sovereign Platform Audit Journal
CREATE TABLE IF NOT EXISTS gigalibs_platform.platform_audit_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(64) NOT NULL,
  target_entity_type VARCHAR(64) NOT NULL,
  target_entity_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support Impersonation Sessions
CREATE TABLE IF NOT EXISTS gigalibs_platform.impersonation_sessions (
  id VARCHAR(64) PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_users(id),
  target_tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  reason TEXT NOT NULL,
  ticket_number VARCHAR(64) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON gigalibs_platform.platform_tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON gigalibs_platform.platform_tenants(slug);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON gigalibs_platform.module_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON gigalibs_platform.billing_invoices(tenant_id);

-- Tenant Capability Credit Wallets (Tenant-Level Pooled Quota)
CREATE TABLE IF NOT EXISTS gigalibs_platform.tenant_credit_wallets (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  capability_code VARCHAR(64) NOT NULL,
  capability_name VARCHAR(255) NOT NULL,
  unit_name VARCHAR(64) NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  total_credited BIGINT NOT NULL DEFAULT 0,
  total_consumed BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  last_recharge_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, capability_code)
);

-- Tenant Capability Usage Ledger (Per-User Consumption Attribution)
CREATE TABLE IF NOT EXISTS gigalibs_platform.tenant_usage_ledger (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES gigalibs_platform.platform_tenants(id),
  user_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  capability_code VARCHAR(64) NOT NULL,
  module_name VARCHAR(64) NOT NULL,
  units_consumed BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_user ON gigalibs_platform.tenant_usage_ledger(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_cap ON gigalibs_platform.tenant_usage_ledger(tenant_id, capability_code);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON gigalibs_platform.tenant_usage_ledger(created_at);

