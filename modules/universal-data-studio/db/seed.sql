-- Universal Data Studio Production Seed Data
-- Connects and governs cross-module contracts across AR, Spend, Tax, and Treasury

-- 1. Insert Data Contracts
INSERT INTO gigalibs_data_studio.data_contracts (
    id, tenant_id, contract_code, name, domain, owner_team, active_version, compatibility_mode, status, created_at, updated_at
) VALUES
(
    'dc-ar-001',
    'tenant-corp-01',
    'CONTRACT-AR-INVOICE-INGEST',
    'Accounts Receivable Inbound Invoice Ingestion',
    'ACCOUNTS_RECEIVABLE',
    'Billing Engineering',
    '1.2.0',
    'BACKWARD',
    'PUBLISHED',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '2 days'
),
(
    'dc-spend-001',
    'tenant-corp-01',
    'CONTRACT-SPEND-PLAID-TX',
    'Corporate Card Live Transaction Stream',
    'SPEND_MANAGEMENT',
    'Treasury Operations',
    '1.0.0',
    'FULL',
    'PUBLISHED',
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '5 days'
),
(
    'dc-tax-001',
    'tenant-corp-01',
    'CONTRACT-TAX-CALC-ENVELOPE',
    'Multi-Jurisdiction Nexus Tax Envelope',
    'TAX_CONFIGURATION',
    'Statutory Compliance',
    '2.0.0',
    'FORWARD',
    'PUBLISHED',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '1 day'
),
(
    'dc-curr-001',
    'tenant-corp-01',
    'CONTRACT-TREASURY-FX-TICK',
    'Global Central Bank Real-Time FX Feed',
    'MULTI_CURRENCY',
    'Global Markets Desk',
    '1.1.0',
    'BACKWARD',
    'PUBLISHED',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '3 hours'
),
(
    'dc-crm-001',
    'tenant-corp-01',
    'CONTRACT-SALESFORCE-OPP-SYNC',
    'Salesforce Closed-Won Deal Synchronization',
    'INTEGRATIONS',
    'RevOps Systems',
    '1.0.0',
    'BACKWARD',
    'PUBLISHED',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '6 days'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    active_version = EXCLUDED.active_version,
    updated_at = NOW();

-- 2. Insert Contract Versions
INSERT INTO gigalibs_data_studio.contract_versions (
    id, contract_id, version, json_schema, schema_format, change_summary, is_breaking_change, published_by, published_at
) VALUES
(
    'ver-ar-100',
    'dc-ar-001',
    '1.0.0',
    '{"type": "object", "required": ["invoice_number", "customer_id", "currency", "amount_minor", "due_date"], "properties": {"invoice_number": {"type": "string", "pattern": "^INV-[0-9]{4}-[0-9]{4}$"}, "customer_id": {"type": "string"}, "currency": {"type": "string", "minLength": 3, "maxLength": 3}, "amount_minor": {"type": "integer", "minimum": 1}, "due_date": {"type": "string", "format": "date"}}}'::jsonb,
    'JSONSCHEMA_DRAFT_07',
    'Initial AR invoice ingest schema contract',
    false,
    'usr-billing-lead',
    NOW() - INTERVAL '30 days'
),
(
    'ver-ar-120',
    'dc-ar-001',
    '1.2.0',
    '{"type": "object", "required": ["invoice_number", "customer_id", "currency", "amount_minor", "due_date", "lines"], "properties": {"invoice_number": {"type": "string", "pattern": "^INV-[0-9]{4}-[0-9]{4}$"}, "customer_id": {"type": "string"}, "currency": {"type": "string", "minLength": 3, "maxLength": 3}, "amount_minor": {"type": "integer", "minimum": 1}, "due_date": {"type": "string", "format": "date"}, "lines": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["description", "unit_price_minor", "quantity"], "properties": {"description": {"type": "string"}, "unit_price_minor": {"type": "integer", "minimum": 0}, "quantity": {"type": "integer", "minimum": 1}, "tax_code": {"type": "string"}}}}}}'::jsonb,
    'JSONSCHEMA_DRAFT_07',
    'Added line items specification and optional tax code link',
    false,
    'usr-billing-lead',
    NOW() - INTERVAL '2 days'
),
(
    'ver-spend-100',
    'dc-spend-001',
    '1.0.0',
    '{"type": "object", "required": ["transaction_id", "card_id", "employee_id", "merchant_name", "amount_minor", "currency", "authorized_at"], "properties": {"transaction_id": {"type": "string"}, "card_id": {"type": "string"}, "employee_id": {"type": "string"}, "merchant_name": {"type": "string"}, "amount_minor": {"type": "integer", "minimum": 1}, "currency": {"type": "string", "minLength": 3, "maxLength": 3}, "authorized_at": {"type": "string", "format": "date-time"}, "mcc_code": {"type": "string", "maxLength": 4}}}'::jsonb,
    'JSONSCHEMA_DRAFT_07',
    'Plaid/Visa direct spend contract v1',
    false,
    'usr-treasury-lead',
    NOW() - INTERVAL '25 days'
),
(
    'ver-tax-200',
    'dc-tax-001',
    '2.0.0',
    '{"type": "object", "required": ["transaction_id", "origin_country", "destination_country", "jurisdiction_code", "gross_amount_minor", "currency"], "properties": {"transaction_id": {"type": "string"}, "origin_country": {"type": "string", "minLength": 2, "maxLength": 2}, "destination_country": {"type": "string", "minLength": 2, "maxLength": 2}, "jurisdiction_code": {"type": "string"}, "gross_amount_minor": {"type": "integer"}, "currency": {"type": "string", "minLength": 3, "maxLength": 3}, "exemption_certificate_id": {"type": "string"}}}'::jsonb,
    'JSONSCHEMA_DRAFT_07',
    'Enforced ISO 3166-1 alpha-2 country codes and certificate validation',
    false,
    'usr-tax-counsel',
    NOW() - INTERVAL '1 day'
),
(
    'ver-curr-110',
    'dc-curr-001',
    '1.1.0',
    '{"type": "object", "required": ["base_currency", "quote_currency", "mid_rate", "source_feed", "timestamp"], "properties": {"base_currency": {"type": "string", "minLength": 3, "maxLength": 3}, "quote_currency": {"type": "string", "minLength": 3, "maxLength": 3}, "mid_rate": {"type": "number", "minimum": 0.00000001}, "bid_rate": {"type": "number"}, "ask_rate": {"type": "number"}, "source_feed": {"type": "string"}, "timestamp": {"type": "string", "format": "date-time"}}}'::jsonb,
    'JSONSCHEMA_DRAFT_07',
    'Added bid/ask market spread attributes',
    false,
    'usr-markets-lead',
    NOW() - INTERVAL '3 hours'
)
ON CONFLICT (id) DO UPDATE SET
    json_schema = EXCLUDED.json_schema,
    change_summary = EXCLUDED.change_summary;

-- 3. Insert Field Mappings
INSERT INTO gigalibs_data_studio.field_mappings (
    id, contract_id, mapping_name, source_system, mapping_rules, currency_normalization, target_currency, is_active, created_at
) VALUES
(
    'map-sap-ar',
    'dc-ar-001',
    'SAP S/4HANA BSID/BSAD ➔ AR Invoice Ingest',
    'SAP_S4HANA',
    '[
        {"source": "VBELN", "target": "invoice_number", "transform": "PREFIX:INV-"},
        {"source": "KUNNR", "target": "customer_id", "transform": "DIRECT"},
        {"source": "WAERS", "target": "currency", "transform": "UPPERCASE"},
        {"source": "WRBTR", "target": "amount_minor", "transform": "DECIMAL_TO_MINOR"},
        {"source": "NETDT", "target": "due_date", "transform": "DATE_ISO8601"}
    ]'::jsonb,
    true,
    'USD',
    true,
    NOW() - INTERVAL '28 days'
),
(
    'map-plaid-spend',
    'dc-spend-001',
    'Plaid Real-Time Webhook ➔ Spend Management Transaction',
    'PLAID',
    '[
        {"source": "transaction_id", "target": "transaction_id", "transform": "DIRECT"},
        {"source": "account_id", "target": "card_id", "transform": "DIRECT"},
        {"source": "name", "target": "merchant_name", "transform": "TRIM"},
        {"source": "amount", "target": "amount_minor", "transform": "DECIMAL_TO_MINOR"},
        {"source": "iso_currency_code", "target": "currency", "transform": "UPPERCASE"},
        {"source": "datetime", "target": "authorized_at", "transform": "DATE_ISO8601"}
    ]'::jsonb,
    true,
    'USD',
    true,
    NOW() - INTERVAL '24 days'
),
(
    'map-sf-opp',
    'dc-ar-001',
    'Salesforce Won Opportunity ➔ AR Invoice',
    'SALESFORCE',
    '[
        {"source": "OpportunityId", "target": "invoice_number", "transform": "PREFIX:SF-"},
        {"source": "AccountId", "target": "customer_id", "transform": "DIRECT"},
        {"source": "Amount", "target": "amount_minor", "transform": "DECIMAL_TO_MINOR"},
        {"source": "CurrencyIsoCode", "target": "currency", "transform": "UPPERCASE"},
        {"source": "CloseDate", "target": "due_date", "transform": "DIRECT"}
    ]'::jsonb,
    true,
    'USD',
    true,
    NOW() - INTERVAL '8 days'
)
ON CONFLICT (id) DO UPDATE SET
    mapping_rules = EXCLUDED.mapping_rules,
    currency_normalization = EXCLUDED.currency_normalization;

-- 4. Insert Quality Assertions
INSERT INTO gigalibs_data_studio.quality_assertions (
    id, contract_id, rule_name, field_path, assertion_type, parameters, severity, created_at
) VALUES
(
    'qa-ar-01',
    'dc-ar-001',
    'Ensure Invoice Number Formatted',
    'invoice_number',
    'REGEX_PATTERN',
    '{"regex": "^(INV|SF)-[A-Za-z0-9-]+$"}'::jsonb,
    'ERROR',
    NOW() - INTERVAL '30 days'
),
(
    'qa-ar-02',
    'dc-ar-001',
    'Valid ISO-4217 Currency Code',
    'currency',
    'VALID_ISO_CURRENCY',
    '{"allowedCurrencies": ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "INR", "SGD"]}'::jsonb,
    'ERROR',
    NOW() - INTERVAL '30 days'
),
(
    'qa-ar-03',
    'dc-ar-001',
    'Positive Monetary Minor Units',
    'amount_minor',
    'RANGE_BOUNDS',
    '{"min": 1, "max": 10000000000}'::jsonb,
    'ERROR',
    NOW() - INTERVAL '30 days'
),
(
    'qa-spend-01',
    'dc-spend-001',
    'Mandatory Merchant Attribution',
    'merchant_name',
    'NOT_NULL',
    '{"minLength": 2}'::jsonb,
    'ERROR',
    NOW() - INTERVAL '25 days'
),
(
    'qa-tax-01',
    'dc-tax-001',
    'Standard ISO Alpha-2 Country Code',
    'destination_country',
    'REGEX_PATTERN',
    '{"regex": "^[A-Z]{2}$"}'::jsonb,
    'ERROR',
    NOW() - INTERVAL '20 days'
)
ON CONFLICT (id) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    severity = EXCLUDED.severity;

-- 5. Insert Sample Schema Drift & Violation Logs
INSERT INTO gigalibs_data_studio.schema_drift_logs (
    id, tenant_id, contract_id, drift_type, details, source_ip, occurred_at
) VALUES
(
    'drift-001',
    'tenant-corp-01',
    'dc-ar-001',
    'UNEXPECTED_FIELD',
    '{"unexpected_fields": ["legacy_tax_rate", "discount_percentage"], "source_system": "SAP_S4HANA", "status": "REJECTED"}'::jsonb,
    '192.168.1.104',
    NOW() - INTERVAL '2 hours'
),
(
    'drift-002',
    'tenant-corp-01',
    'dc-spend-001',
    'TYPE_MISMATCH',
    '{"field": "amount_minor", "expected": "integer", "received": "float (142.50)", "action": "COERCED_TO_MINOR"}'::jsonb,
    '10.0.4.12',
    NOW() - INTERVAL '45 minutes'
),
(
    'drift-003',
    'tenant-corp-01',
    'dc-tax-001',
    'CONSTRAINT_VIOLATION',
    '{"field": "destination_country", "value": "USA", "error": "Must be 2-letter alpha ISO code (US)", "action": "DROPPED_TO_DLQ"}'::jsonb,
    '172.16.0.88',
    NOW() - INTERVAL '12 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- 6. Insert Audit Events
INSERT INTO gigalibs_data_studio.audit_events (
    id, tenant_id, entity_type, entity_id, action, payload, created_at
) VALUES
(
    'aud-ds-01',
    'tenant-corp-01',
    'DATA_CONTRACT',
    'dc-ar-001',
    'VERSION_PUBLISHED',
    '{"version": "1.2.0", "change_summary": "Added line items specification and optional tax code link", "compatibility": "BACKWARD"}'::jsonb,
    NOW() - INTERVAL '2 days'
),
(
    'aud-ds-02',
    'tenant-corp-01',
    'FIELD_MAPPING',
    'map-sap-ar',
    'PIPELINE_ACTIVATED',
    '{"pipeline": "SAP S/4HANA BSID/BSAD ➔ AR Invoice Ingest", "currency_normalization": true, "target_currency": "USD"}'::jsonb,
    NOW() - INTERVAL '28 days'
)
ON CONFLICT (id) DO NOTHING;
