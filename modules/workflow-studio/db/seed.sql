-- Workflow Studio Production Seed Data
-- Connects the entire platform into automated, durable DAG pipelines

-- 1. Insert Workflow Definitions
INSERT INTO gigalibs_workflow.workflow_definitions (
    id, tenant_id, workflow_code, name, description, category, active_version, trigger_type, trigger_config, status, created_at, updated_at
) VALUES
(
    'wf-o2c-01',
    'tenant-corp-01',
    'WF-O2C-CROSS-BORDER',
    'Global Cross-Border Order-to-Cash Pipeline',
    'Orchestrates inbound international sales orders: validates schema against Data Studio, converts EUR/GBP to USD via MultiCurrency, evaluates credit policy via Universal Rule Pro, and posts invoice to AR.',
    'ORDER_TO_CASH',
    '1.0.0',
    'EVENT_WEBHOOK',
    '{"source": "SALESFORCE_CRM", "event_type": "opportunity.closed_won"}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '2 days'
),
(
    'wf-p2p-01',
    'tenant-corp-01',
    'WF-P2P-SPEND-APPROVAL',
    'Procure-to-Pay Dual Executive Approval Pipeline',
    'Routes purchase requisitions through Universal Rule Pro policy checks, enforces dual-VP approvals for items >= $50,000, and posts approved PO to Spend Management.',
    'PROCURE_TO_PAY',
    '1.0.0',
    'EVENT_WEBHOOK',
    '{"source": "COUPA_PROCUREMENT", "event_type": "requisition.created"}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '4 days'
),
(
    'wf-hedge-01',
    'tenant-corp-01',
    'WF-TREASURY-AUTO-HEDGE',
    'Daily Multi-Currency FX Exposure & Auto-Hedging',
    'Daily automated treasury run: aggregates unhedged foreign receivables, evaluates hedging trigger rules, and books forward derivative contracts.',
    'TREASURY_HEDGING',
    '1.0.0',
    'SCHEDULE_CRON',
    '{"cron": "0 17 * * 1-5", "timezone": "America/New_York"}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 2. Insert Workflow Versions (DAG Definitions)
INSERT INTO gigalibs_workflow.workflow_versions (
    id, workflow_id, version, dag_definition, published_by, published_at
) VALUES
(
    'ver-o2c-100',
    'wf-o2c-01',
    '1.0.0',
    '{
        "nodes": [
            {"id": "step-trigger", "name": "Inbound Salesforce Deal", "type": "TRIGGER", "service_target": "WEBHOOK", "action": "INGEST"},
            {"id": "step-schema-val", "name": "Data Studio Contract Validation", "type": "CONTRACT_VALIDATION", "service_target": "DATA_STUDIO_PORT_3800", "action": "VALIDATE_CONTRACT", "config": {"contract_code": "CONTRACT-AR-INVOICE-INGEST"}},
            {"id": "step-fx-convert", "name": "MultiCurrency FX Normalization", "type": "FX_CONVERSION", "service_target": "CURRENCY_PORT_3700", "action": "CONVERT_TO_BASE", "config": {"target_currency": "USD"}},
            {"id": "step-rule-eval", "name": "Universal Rule Pro Policy Check", "type": "RULE_DECISION", "service_target": "RULES_PORT_3900", "action": "EVALUATE_RULES", "config": {"domain": "ACCOUNTS_RECEIVABLE"}},
            {"id": "step-tax-calc", "name": "Tax Nexus Calculation", "type": "TAX_CALCULATION", "service_target": "TAX_PORT_3600", "action": "CALCULATE_TAX", "config": {"jurisdiction": "DE_VAT"}},
            {"id": "step-ar-post", "name": "Accounts Receivable Ledger Post", "type": "LEDGER_WRITE", "service_target": "AR_PORT_3400", "action": "CREATE_INVOICE"},
            {"id": "step-notify", "name": "Executive Notification Alert", "type": "NOTIFICATION", "service_target": "ALERT_DISPATCH", "action": "SLACK_NOTIFY"}
        ],
        "edges": [
            {"from": "step-trigger", "to": "step-schema-val"},
            {"from": "step-schema-val", "to": "step-fx-convert", "condition": "step-schema-val.valid == true"},
            {"from": "step-fx-convert", "to": "step-rule-eval"},
            {"from": "step-rule-eval", "to": "step-tax-calc", "condition": "step-rule-eval.credit_hold == false"},
            {"from": "step-tax-calc", "to": "step-ar-post"},
            {"from": "step-ar-post", "to": "step-notify"}
        ]
    }'::jsonb,
    'usr-platform-architect',
    NOW() - INTERVAL '30 days'
),
(
    'ver-p2p-100',
    'wf-p2p-01',
    '1.0.0',
    '{
        "nodes": [
            {"id": "step-req-trigger", "name": "Requisition Submitted", "type": "TRIGGER", "service_target": "WEBHOOK", "action": "INGEST"},
            {"id": "step-spend-policy", "name": "Universal Rule Spend Check", "type": "RULE_DECISION", "service_target": "RULES_PORT_3900", "action": "EVALUATE_POLICY", "config": {"rule_code": "RULE-SPEND-VP-APPROVAL"}},
            {"id": "step-vp-approval", "name": "Dual-VP Authorization Gate", "type": "APPROVAL_GATE", "service_target": "HUMAN_APPROVAL", "action": "AWAIT_DUAL_SIGN"},
            {"id": "step-spend-post", "name": "Spend Management PO Commit", "type": "LEDGER_WRITE", "service_target": "SPEND_PORT_3500", "action": "COMMIT_PO"}
        ],
        "edges": [
            {"from": "step-req-trigger", "to": "step-spend-policy"},
            {"from": "step-spend-policy", "to": "step-vp-approval", "condition": "amount >= 50000"},
            {"from": "step-vp-approval", "to": "step-spend-post", "condition": "approved == true"}
        ]
    }'::jsonb,
    'usr-procure-lead',
    NOW() - INTERVAL '25 days'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Sample Execution Runs
INSERT INTO gigalibs_workflow.workflow_runs (
    id, tenant_id, workflow_id, workflow_code, version, correlation_id, trigger_payload, state, status, current_step_id, started_at, completed_at, duration_ms
) VALUES
(
    'run-o2c-001',
    'tenant-corp-01',
    'wf-o2c-01',
    'WF-O2C-CROSS-BORDER',
    '1.0.0',
    'corr-sf-9042',
    '{"deal_id": "SF-99120", "customer": "Siemens AG", "currency": "EUR", "amount": 150000, "items": [{"sku": "CLOUD-CORE", "qty": 1}]}'::jsonb,
    '{"schema_valid": true, "converted_usd": 162795.75, "credit_hold": false, "tax_minor": 0, "invoice_id": "INV-2026-9042"}'::jsonb,
    'COMPLETED',
    'step-notify',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours' + INTERVAL '184 milliseconds',
    184
),
(
    'run-p2p-001',
    'tenant-corp-01',
    'wf-p2p-01',
    'WF-P2P-SPEND-APPROVAL',
    '1.0.0',
    'corr-cp-8819',
    '{"requisition_id": "REQ-7721", "amount_usd": 85000, "vendor": "Datadog", "cost_center": "CORP-IT"}'::jsonb,
    '{"policy_matched": true, "dual_vp_required": true, "vp_finance_signed": true, "cfo_signed": true, "po_number": "PO-2026-7721"}'::jsonb,
    'COMPLETED',
    'step-spend-post',
    NOW() - INTERVAL '45 minutes',
    NOW() - INTERVAL '45 minutes' + INTERVAL '312 milliseconds',
    312
)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Step Executions for run-o2c-001 (Checkpointing & Audit)
INSERT INTO gigalibs_workflow.step_executions (
    id, run_id, step_id, step_name, step_type, input_payload, output_payload, status, retry_count, latency_ms, started_at, completed_at
) VALUES
(
    'step-exec-01',
    'run-o2c-001',
    'step-schema-val',
    'Data Studio Contract Validation',
    'CONTRACT_VALIDATION',
    '{"deal_id": "SF-99120", "amount": 150000, "currency": "EUR"}'::jsonb,
    '{"valid": true, "schema_checked": "CONTRACT-AR-INVOICE-INGEST"}'::jsonb,
    'COMPLETED',
    0,
    18,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours' + INTERVAL '18 milliseconds'
),
(
    'step-exec-02',
    'run-o2c-001',
    'step-fx-convert',
    'MultiCurrency FX Normalization',
    'FX_CONVERSION',
    '{"amount": 150000, "from": "EUR", "to": "USD"}'::jsonb,
    '{"converted_usd": 162795.75, "rate": 1.085305, "source": "ECB_CENTRAL_BANK"}'::jsonb,
    'COMPLETED',
    0,
    34,
    NOW() - INTERVAL '2 hours' + INTERVAL '19 milliseconds',
    NOW() - INTERVAL '2 hours' + INTERVAL '53 milliseconds'
),
(
    'step-exec-03',
    'run-o2c-001',
    'step-rule-eval',
    'Universal Rule Pro Policy Check',
    'RULE_DECISION',
    '{"amount_usd": 162795.75, "customer_risk": "LOW"}'::jsonb,
    '{"credit_hold": false, "action": "CLEAR_FOR_DISPATCH", "latency_ms": 0.42}'::jsonb,
    'COMPLETED',
    0,
    8,
    NOW() - INTERVAL '2 hours' + INTERVAL '54 milliseconds',
    NOW() - INTERVAL '2 hours' + INTERVAL '62 milliseconds'
),
(
    'step-exec-04',
    'run-o2c-001',
    'step-ar-post',
    'Accounts Receivable Ledger Post',
    'LEDGER_WRITE',
    '{"invoice_number": "INV-2026-9042", "amount_minor": 16279575}'::jsonb,
    '{"invoice_id": "inv-9042", "ledger_status": "POSTED"}'::jsonb,
    'COMPLETED',
    0,
    82,
    NOW() - INTERVAL '2 hours' + INTERVAL '63 milliseconds',
    NOW() - INTERVAL '2 hours' + INTERVAL '145 milliseconds'
),
(
    'step-exec-05',
    'run-o2c-001',
    'step-notify',
    'Executive Notification Alert',
    'NOTIFICATION',
    '{"channel": "#finance-ops", "event": "CROSS_BORDER_INVOICE_POSTED"}'::jsonb,
    '{"slack_status": 200, "delivered": true}'::jsonb,
    'COMPLETED',
    0,
    39,
    NOW() - INTERVAL '2 hours' + INTERVAL '145 milliseconds',
    NOW() - INTERVAL '2 hours' + INTERVAL '184 milliseconds'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Audit Events
INSERT INTO gigalibs_workflow.audit_events (
    id, tenant_id, entity_type, entity_id, action, payload, created_at
) VALUES
(
    'aud-wf-01',
    'tenant-corp-01',
    'WORKFLOW',
    'wf-o2c-01',
    'VERSION_PUBLISHED',
    '{"version": "1.0.0", "steps_count": 7, "edges_count": 6}'::jsonb,
    NOW() - INTERVAL '30 days'
)
ON CONFLICT (id) DO NOTHING;
