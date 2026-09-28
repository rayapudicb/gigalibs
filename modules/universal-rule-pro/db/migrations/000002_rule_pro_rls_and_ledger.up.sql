-- Migration 000002: Row Level Security, Migration Tracking, Hierarchical Scoping, and Evaluation Ledgers for Universal Rule Pro
-- Schema: gigalibs_rules

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS gigalibs_rules.schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Extend rules with department, lifecycle_status, published_version, and approver_id (RL-01)
ALTER TABLE gigalibs_rules.rules
    ADD COLUMN IF NOT EXISTS department VARCHAR(64),
    ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS published_version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    ADD COLUMN IF NOT EXISTS approver_id VARCHAR(64);

-- 3. Extend rule_evaluation_logs with verdict, rule_version_id, proposed_action, and is_preview (RL-03, RL-04)
ALTER TABLE gigalibs_rules.rule_evaluation_logs
    ADD COLUMN IF NOT EXISTS rule_version_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS evaluation_verdict VARCHAR(32) NOT NULL DEFAULT 'NO_MATCH',
    ADD COLUMN IF NOT EXISTS proposed_action JSONB,
    ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE gigalibs_rules.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_rules.decision_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_rules.rule_evaluation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_rules.audit_events ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
-- Rules: Tenant isolation with visibility for system/platform statutory guardrails
DROP POLICY IF EXISTS tenant_isolation_rules ON gigalibs_rules.rules;
CREATE POLICY tenant_isolation_rules ON gigalibs_rules.rules
    AS RESTRICTIVE
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR scope = 'PLATFORM'
    )
    WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
    );

DROP POLICY IF EXISTS tenant_isolation_decision_tables ON gigalibs_rules.decision_tables;
CREATE POLICY tenant_isolation_decision_tables ON gigalibs_rules.decision_tables
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_eval_logs ON gigalibs_rules.rule_evaluation_logs;
CREATE POLICY tenant_isolation_eval_logs ON gigalibs_rules.rule_evaluation_logs
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_audit_rules ON gigalibs_rules.audit_events;
CREATE POLICY tenant_isolation_audit_rules ON gigalibs_rules.audit_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 6. Record applied migrations
INSERT INTO gigalibs_rules.schema_migrations (version, name, applied_at)
VALUES 
    (1, '000001_rules_foundation', NOW()),
    (2, '000002_rule_pro_rls_and_ledger', NOW())
ON CONFLICT (version) DO NOTHING;
