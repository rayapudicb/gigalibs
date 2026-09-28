-- Migration: 000001_rules_foundation
-- Universal Rule Pro & Policy Decision Engine Schema

CREATE SCHEMA IF NOT EXISTS gigalibs_rules;

-- 1. Business Policy Rules (with 3-Tier Hierarchy: PLATFORM -> TENANT -> DEPARTMENT)
CREATE TABLE IF NOT EXISTS gigalibs_rules.rules (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    rule_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    domain VARCHAR(64) NOT NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'TENANT',
    parent_rule_id VARCHAR(64) REFERENCES gigalibs_rules.rules(id) ON DELETE SET NULL,
    system_locked BOOLEAN NOT NULL DEFAULT FALSE,
    priority INT NOT NULL DEFAULT 100,
    condition_ast JSONB NOT NULL,
    condition_expression TEXT NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    action_params JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rule_code UNIQUE (tenant_id, rule_code)
);

-- 2. Rule Versions (Immutable Audit Trail of Policy Changes)
CREATE TABLE IF NOT EXISTS gigalibs_rules.rule_versions (
    id VARCHAR(64) PRIMARY KEY,
    rule_id VARCHAR(64) REFERENCES gigalibs_rules.rules(id) ON DELETE CASCADE,
    version VARCHAR(16) NOT NULL,
    condition_ast JSONB NOT NULL,
    condition_expression TEXT NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    action_params JSONB NOT NULL,
    published_by VARCHAR(64) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rule_version UNIQUE (rule_id, version)
);

-- 3. Multi-Dimensional Decision Tables (DMN Matrices)
CREATE TABLE IF NOT EXISTS gigalibs_rules.decision_tables (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    table_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    hit_policy VARCHAR(16) NOT NULL DEFAULT 'FIRST_MATCH',
    columns JSONB NOT NULL,
    rows JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_table_code UNIQUE (tenant_id, table_code)
);

-- 4. Rule Evaluation Audit Logs (SOX / Regulatory Compliance)
CREATE TABLE IF NOT EXISTS gigalibs_rules.rule_evaluation_logs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    rule_id VARCHAR(64) REFERENCES gigalibs_rules.rules(id),
    rule_code VARCHAR(64) NOT NULL,
    context_id VARCHAR(128),
    domain VARCHAR(64) NOT NULL,
    input_payload JSONB NOT NULL,
    matched BOOLEAN NOT NULL,
    execution_latency_ms NUMERIC(8, 3) NOT NULL,
    action_taken VARCHAR(64),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Audit Events
CREATE TABLE IF NOT EXISTS gigalibs_rules.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sub-millisecond evaluation lookups
CREATE INDEX IF NOT EXISTS idx_rules_tenant_domain_status ON gigalibs_rules.rules(tenant_id, domain, status, priority ASC);
CREATE INDEX IF NOT EXISTS idx_rules_scope ON gigalibs_rules.rules(scope);
CREATE INDEX IF NOT EXISTS idx_eval_logs_tenant_time ON gigalibs_rules.rule_evaluation_logs(tenant_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_tables_lookup ON gigalibs_rules.decision_tables(tenant_id, domain, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_rules ON gigalibs_rules.audit_events(tenant_id, created_at DESC);
