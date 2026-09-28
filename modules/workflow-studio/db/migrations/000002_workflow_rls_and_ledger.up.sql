-- Migration 000002: Row Level Security, Migration Tracking, Lease Fencing, and Action Receipts for Workflow Studio
-- Schema: gigalibs_workflow

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS gigalibs_workflow.schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Extend workflow_runs with lease fencing, version tracking, and action receipts (WF-01, WF-03, WF-04)
ALTER TABLE gigalibs_workflow.workflow_runs
    ADD COLUMN IF NOT EXISTS lease_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS action_receipts JSONB NOT NULL DEFAULT '[]';

-- 3. Extend step_executions with retry attempts, idempotency keys, and action receipts
ALTER TABLE gigalibs_workflow.step_executions
    ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS action_receipt JSONB,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- 4. Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE gigalibs_workflow.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workflow.workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workflow.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workflow.step_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workflow.audit_events ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_workflows ON gigalibs_workflow.workflow_definitions;
CREATE POLICY tenant_isolation_workflows ON gigalibs_workflow.workflow_definitions
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_wf_versions ON gigalibs_workflow.workflow_versions;
CREATE POLICY tenant_isolation_wf_versions ON gigalibs_workflow.workflow_versions
    AS RESTRICTIVE
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM gigalibs_workflow.workflow_definitions w
            WHERE w.id = workflow_versions.workflow_id
              AND w.tenant_id = current_setting('app.tenant_id', true)
        )
    );

DROP POLICY IF EXISTS tenant_isolation_wf_runs ON gigalibs_workflow.workflow_runs;
CREATE POLICY tenant_isolation_wf_runs ON gigalibs_workflow.workflow_runs
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_step_executions ON gigalibs_workflow.step_executions;
CREATE POLICY tenant_isolation_step_executions ON gigalibs_workflow.step_executions
    AS RESTRICTIVE
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM gigalibs_workflow.workflow_runs r
            WHERE r.id = step_executions.run_id
              AND r.tenant_id = current_setting('app.tenant_id', true)
        )
    );

DROP POLICY IF EXISTS tenant_isolation_audit_workflow ON gigalibs_workflow.audit_events;
CREATE POLICY tenant_isolation_audit_workflow ON gigalibs_workflow.audit_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 6. Record applied migrations
INSERT INTO gigalibs_workflow.schema_migrations (version, name, applied_at)
VALUES 
    (1, '000001_workflow_foundation', NOW()),
    (2, '000002_workflow_rls_and_ledger', NOW())
ON CONFLICT (version) DO NOTHING;
