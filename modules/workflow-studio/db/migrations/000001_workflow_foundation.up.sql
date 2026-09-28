-- Migration: 000001_workflow_foundation
-- Workflow Studio & Durable DAG Orchestrator Schema

CREATE SCHEMA IF NOT EXISTS gigalibs_workflow;

-- 1. Workflow Definitions
CREATE TABLE IF NOT EXISTS gigalibs_workflow.workflow_definitions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    workflow_code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    category VARCHAR(64) NOT NULL,
    active_version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    trigger_type VARCHAR(32) NOT NULL DEFAULT 'EVENT_WEBHOOK',
    trigger_config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_code UNIQUE (tenant_id, workflow_code)
);

-- 2. Workflow Versions (Immutable DAG Graph Specifications)
CREATE TABLE IF NOT EXISTS gigalibs_workflow.workflow_versions (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) REFERENCES gigalibs_workflow.workflow_definitions(id) ON DELETE CASCADE,
    version VARCHAR(16) NOT NULL,
    dag_definition JSONB NOT NULL,
    published_by VARCHAR(64) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_version UNIQUE (workflow_id, version)
);

-- 3. Workflow Execution Runs (Durable State Machine Instances)
CREATE TABLE IF NOT EXISTS gigalibs_workflow.workflow_runs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    workflow_id VARCHAR(64) REFERENCES gigalibs_workflow.workflow_definitions(id),
    workflow_code VARCHAR(64) NOT NULL,
    version VARCHAR(16) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    trigger_payload JSONB NOT NULL,
    state JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    current_step_id VARCHAR(64),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    error_details JSONB
);

-- 4. Step Executions (Checkpointing & Time-Travel Replay)
CREATE TABLE IF NOT EXISTS gigalibs_workflow.step_executions (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) REFERENCES gigalibs_workflow.workflow_runs(id) ON DELETE CASCADE,
    step_id VARCHAR(64) NOT NULL,
    step_name VARCHAR(128) NOT NULL,
    step_type VARCHAR(64) NOT NULL,
    input_payload JSONB NOT NULL,
    output_payload JSONB,
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    retry_count INT NOT NULL DEFAULT 0,
    latency_ms INT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- 5. Audit Events
CREATE TABLE IF NOT EXISTS gigalibs_workflow.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-throughput orchestration
CREATE INDEX IF NOT EXISTS idx_wf_tenant_cat ON gigalibs_workflow.workflow_definitions(tenant_id, category, status);
CREATE INDEX IF NOT EXISTS idx_wf_runs_tenant_started ON gigalibs_workflow.workflow_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status ON gigalibs_workflow.workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_step_exec_run_time ON gigalibs_workflow.step_executions(run_id, started_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_wf_tenant ON gigalibs_workflow.audit_events(tenant_id, created_at DESC);
