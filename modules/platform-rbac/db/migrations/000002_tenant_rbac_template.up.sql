-- Dynamic Tenant RBAC Template
-- Executed within tenant-specific schema (e.g. tenant_<slug>_core)

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  parent_id VARCHAR(64) REFERENCES departments(id),
  manager_name VARCHAR(255),
  spending_limit_usd NUMERIC(12, 2) NOT NULL DEFAULT 50000.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR(64) PRIMARY KEY,
  department_id VARCHAR(64) REFERENCES departments(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(128) NOT NULL UNIQUE,
  resource VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_memberships (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  department_id VARCHAR(64) REFERENCES departments(id),
  group_id VARCHAR(64) REFERENCES groups(id),
  role_id VARCHAR(64) NOT NULL REFERENCES roles(id),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  spending_limit_usd NUMERIC(12, 2) NOT NULL DEFAULT 10000.00,
  allowed_cost_centers TEXT[] NOT NULL DEFAULT '{}',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Granular User-Level Permission Overrides (Grant or Deny)
CREATE TABLE IF NOT EXISTS user_permissions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES user_memberships(id) ON DELETE CASCADE,
  permission_code VARCHAR(128) NOT NULL,
  effect VARCHAR(8) NOT NULL DEFAULT 'GRANT', -- 'GRANT' or 'DENY'
  granted_by VARCHAR(64) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, permission_code)
);

-- Resource-Level Access Control Lists (Row-Level Security)
CREATE TABLE IF NOT EXISTS user_resource_acls (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES user_memberships(id) ON DELETE CASCADE,
  resource_type VARCHAR(64) NOT NULL, -- 'INVOICE', 'WORKFLOW', 'COST_CENTER', 'CONNECTOR'
  resource_id VARCHAR(64) NOT NULL,
  access_level VARCHAR(32) NOT NULL DEFAULT 'VIEW', -- 'VIEW', 'EDIT', 'APPROVE', 'ADMIN'
  granted_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, resource_type, resource_id)
);

CREATE TABLE IF NOT EXISTS tenant_audit_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Usage Ledger (Per-User Consumption Attribution inside sovereign schema)
CREATE TABLE IF NOT EXISTS tenant_usage_ledger (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES user_memberships(id),
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  capability_code VARCHAR(64) NOT NULL,
  module_name VARCHAR(64) NOT NULL,
  units_consumed BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_user ON tenant_usage_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_cap ON tenant_usage_ledger(capability_code);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_created ON tenant_usage_ledger(created_at);

