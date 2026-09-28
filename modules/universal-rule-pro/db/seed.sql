-- Universal Rule Pro Production Seed Data
-- 3-Tier Hierarchy: PLATFORM (Global Statutory) -> TENANT (Org Defaults) -> DEPARTMENT (Overrides)

-- 1. Insert Rules
INSERT INTO gigalibs_rules.rules (
    id, tenant_id, rule_code, name, description, domain, scope, system_locked, priority, 
    condition_ast, condition_expression, action_type, action_params, status, created_at, updated_at
) VALUES
(
    'rul-plat-01',
    'tenant-corp-01',
    'RULE-PLATFORM-SOX-LEDGER-AUDIT',
    'Mandatory SOX 404 Tamper-Proof Audit Logging',
    'Platform statutory baseline requiring immutable cryptographic audit records on all financial ledger transactions.',
    'PLATFORM_GOVERNANCE',
    'PLATFORM',
    true,
    1,
    '{"operator": "AND", "rules": [{"field": "transaction.amount_minor", "operator": ">", "value": 0}]}'::jsonb,
    'transaction.amount_minor > 0',
    'ENFORCE_CRYPTOGRAPHIC_AUDIT_TRAIL',
    '{"audit_level": "COMPLIANCE_SOX_404", "retention_years": 7}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '10 days'
),
(
    'rul-ar-01',
    'tenant-corp-01',
    'RULE-AR-OVERDUE-HOLD',
    'Automatic AR Credit Hold at 60+ Days Past Due',
    'Corporate tenant policy placing customer on automatic order hold when past due exceeds 60 days with high risk tier.',
    'ACCOUNTS_RECEIVABLE',
    'TENANT',
    false,
    10,
    '{"operator": "AND", "rules": [{"field": "invoice.aging_days", "operator": ">", "value": 60}, {"field": "customer.credit_risk", "operator": "==", "value": "HIGH"}]}'::jsonb,
    'invoice.aging_days > 60 && customer.credit_risk == "HIGH"',
    'RESTRICT_ORDER_DISPATCH',
    '{"hold_reason": "DSO_EXCEEDED_POLICY", "notify_credit_manager": true}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '2 days'
),
(
    'rul-spend-01',
    'tenant-corp-01',
    'RULE-SPEND-VP-APPROVAL',
    'Executive VP Approval on Requisitions >= $50,000',
    'Mandatory dual-authorization threshold for large purchase requisitions or capital expenditures.',
    'SPEND_MANAGEMENT',
    'TENANT',
    false,
    20,
    '{"operator": "AND", "rules": [{"field": "requisition.amount_usd", "operator": ">=", "value": 50000}]}'::jsonb,
    'requisition.amount_usd >= 50000',
    'REQUIRE_DUAL_EXECUTIVE_APPROVAL',
    '{"required_roles": ["VP_FINANCE", "CFO"], "timeout_hours": 48}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '40 days',
    NOW() - INTERVAL '5 days'
),
(
    'rul-tax-01',
    'tenant-corp-01',
    'RULE-TAX-FAR-EXEMPTION',
    'Federal Acquisition Regulation (FAR 52.229-3) Exemption',
    'Zero-rates statutory tax calculation for authorized federal entities possessing active exemption certificates.',
    'TAX_CONFIGURATION',
    'TENANT',
    false,
    5,
    '{"operator": "AND", "rules": [{"field": "document.customer_type", "operator": "==", "value": "FEDERAL_AGENCY"}, {"field": "document.has_valid_cert", "operator": "==", "value": true}]}'::jsonb,
    'document.customer_type == "FEDERAL_AGENCY" && document.has_valid_cert == true',
    'OVERRIDE_TAX_RATE_ZERO',
    '{"statutory_code": "FAR_52_229_3", "exemption_type": "GOVERNMENT_FEDERAL"}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '35 days',
    NOW() - INTERVAL '1 day'
),
(
    'rul-fx-01',
    'tenant-corp-01',
    'RULE-FX-HEDGE-TRIGGER',
    'Auto-Trigger Forward Cover on Foreign Billings > €100k',
    'Treasury hedging rule evaluating foreign currency transaction exposures and proposing forward currency contracts.',
    'MULTI_CURRENCY',
    'TENANT',
    false,
    15,
    '{"operator": "AND", "rules": [{"field": "billing.currency", "operator": "!=", "value": "USD"}, {"field": "billing.amount_minor", "operator": ">", "value": 10000000}]}'::jsonb,
    'billing.currency != "USD" && billing.amount_minor > 10000000',
    'BOOK_TREASURY_HEDGE_PROPOSAL',
    '{"target_currency": "USD", "derivative_type": "FORWARD_CONTRACT", "tenor_days": 90}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '3 hours'
),
(
    'rul-emea-01',
    'tenant-corp-01',
    'RULE-EMEA-SPEND-MD-APPROVAL',
    'EMEA Subsidiary: Managing Director Approval >= €25,000',
    'Department/Subsidiary specialization tightening the corporate $50k threshold to €25k for all EMEA entities.',
    'SPEND_MANAGEMENT',
    'DEPARTMENT',
    false,
    18,
    '{"operator": "AND", "rules": [{"field": "requisition.entity", "operator": "==", "value": "EMEA_OPERATIONS"}, {"field": "requisition.amount_eur", "operator": ">=", "value": 25000}]}'::jsonb,
    'requisition.entity == "EMEA_OPERATIONS" && requisition.amount_eur >= 25000',
    'REQUIRE_MANAGING_DIRECTOR_APPROVAL',
    '{"required_role": "EMEA_MANAGING_DIRECTOR", "currency": "EUR"}'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    condition_ast = EXCLUDED.condition_ast,
    condition_expression = EXCLUDED.condition_expression,
    action_type = EXCLUDED.action_type,
    updated_at = NOW();

-- 2. Insert Rule Versions
INSERT INTO gigalibs_rules.rule_versions (
    id, rule_id, version, condition_ast, condition_expression, action_type, action_params, published_by, published_at
) VALUES
(
    'ver-ar-01',
    'rul-ar-01',
    '1.0.0',
    '{"operator": "AND", "rules": [{"field": "invoice.aging_days", "operator": ">", "value": 60}, {"field": "customer.credit_risk", "operator": "==", "value": "HIGH"}]}'::jsonb,
    'invoice.aging_days > 60 && customer.credit_risk == "HIGH"',
    'RESTRICT_ORDER_DISPATCH',
    '{"hold_reason": "DSO_EXCEEDED_POLICY"}'::jsonb,
    'usr-credit-officer',
    NOW() - INTERVAL '45 days'
),
(
    'ver-spend-01',
    'rul-spend-01',
    '1.0.0',
    '{"operator": "AND", "rules": [{"field": "requisition.amount_usd", "operator": ">=", "value": 50000}]}'::jsonb,
    'requisition.amount_usd >= 50000',
    'REQUIRE_DUAL_EXECUTIVE_APPROVAL',
    '{"required_roles": ["VP_FINANCE", "CFO"]}'::jsonb,
    'usr-cfo-delegate',
    NOW() - INTERVAL '40 days'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Multi-Dimensional Decision Table (DMN Matrix)
INSERT INTO gigalibs_rules.decision_tables (
    id, tenant_id, table_code, name, domain, hit_policy, columns, rows, status, created_at, updated_at
) VALUES
(
    'dt-credit-01',
    'tenant-corp-01',
    'DMN-CUSTOMER-CREDIT-LIMIT',
    'Customer Credit Limit & Terms Decision Matrix',
    'ACCOUNTS_RECEIVABLE',
    'FIRST_MATCH',
    '{
        "inputs": [
            {"name": "risk_tier", "type": "string", "label": "Customer Risk Tier"},
            {"name": "annual_revenue_usd", "type": "number", "label": "Annual Revenue (USD)"},
            {"name": "region", "type": "string", "label": "Commercial Region"}
        ],
        "outputs": [
            {"name": "credit_limit_usd", "type": "number", "label": "Approved Credit Limit (USD)"},
            {"name": "payment_terms", "type": "string", "label": "Default Net Terms"},
            {"name": "approval_authority", "type": "string", "label": "Approval Authority"}
        ]
    }'::jsonb,
    '[
        {"risk_tier": "LOW", "annual_revenue_usd": ">= 50000000", "region": "ANY", "credit_limit_usd": 2500000, "payment_terms": "NET_60", "approval_authority": "AUTOMATIC_CLEARANCE"},
        {"risk_tier": "LOW", "annual_revenue_usd": "< 50000000", "region": "ANY", "credit_limit_usd": 750000, "payment_terms": "NET_30", "approval_authority": "AUTOMATIC_CLEARANCE"},
        {"risk_tier": "MEDIUM", "annual_revenue_usd": ">= 20000000", "region": "ANY", "credit_limit_usd": 500000, "payment_terms": "NET_30", "approval_authority": "CREDIT_MANAGER"},
        {"risk_tier": "MEDIUM", "annual_revenue_usd": "< 20000000", "region": "ANY", "credit_limit_usd": 150000, "payment_terms": "NET_15", "approval_authority": "CREDIT_OFFICER"},
        {"risk_tier": "HIGH", "annual_revenue_usd": "ANY", "region": "ANY", "credit_limit_usd": 25000, "payment_terms": "PREPAYMENT_ESCROW", "approval_authority": "VP_TREASURY"}
    ]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO UPDATE SET
    rows = EXCLUDED.rows,
    updated_at = NOW();

-- 4. Insert Sample Rule Evaluation Audit Logs
INSERT INTO gigalibs_rules.rule_evaluation_logs (
    id, tenant_id, rule_id, rule_code, context_id, domain, input_payload, matched, execution_latency_ms, action_taken, evaluated_at
) VALUES
(
    'log-eval-001',
    'tenant-corp-01',
    'rul-ar-01',
    'RULE-AR-OVERDUE-HOLD',
    'inv-corp-9941',
    'ACCOUNTS_RECEIVABLE',
    '{"invoice": {"aging_days": 75, "amount_minor": 1250000}, "customer": {"credit_risk": "HIGH"}}'::jsonb,
    true,
    0.421,
    'RESTRICT_ORDER_DISPATCH',
    NOW() - INTERVAL '15 minutes'
),
(
    'log-eval-002',
    'tenant-corp-01',
    'rul-spend-01',
    'RULE-SPEND-VP-APPROVAL',
    'req-po-8812',
    'SPEND_MANAGEMENT',
    '{"requisition": {"amount_usd": 85000, "cost_center": "CORP-IT"}}'::jsonb,
    true,
    0.385,
    'REQUIRE_DUAL_EXECUTIVE_APPROVAL',
    NOW() - INTERVAL '42 minutes'
),
(
    'log-eval-003',
    'tenant-corp-01',
    'rul-tax-01',
    'RULE-TAX-FAR-EXEMPTION',
    'tx-calc-0031',
    'TAX_CONFIGURATION',
    '{"document": {"customer_type": "FEDERAL_AGENCY", "has_valid_cert": true}}'::jsonb,
    true,
    0.290,
    'OVERRIDE_TAX_RATE_ZERO',
    NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Audit Events
INSERT INTO gigalibs_rules.audit_events (
    id, tenant_id, entity_type, entity_id, action, payload, created_at
) VALUES
(
    'aud-rul-01',
    'tenant-corp-01',
    'BUSINESS_RULE',
    'rul-spend-01',
    'POLICY_UPDATED',
    '{"rule_code": "RULE-SPEND-VP-APPROVAL", "threshold_usd": 50000, "authorizer": "usr-cfo-delegate"}'::jsonb,
    NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;
