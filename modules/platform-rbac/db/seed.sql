-- Seed Module Catalog (All 9 Certified Enterprise Modules)
INSERT INTO gigalibs_platform.module_catalog (
  code, name, category, monthly_price_usd, description, icon, badge, capabilities, is_core
) VALUES
(
  'RECOVERY',
  'Autonomous Cash Leakage & Recovery Studio',
  'FINANCIAL_ASSURANCE',
  1500.00,
  'Autonomous detection of duplicate invoices, tax exemption overbilling, unclaimed credits, and automated 1-click clawback workflows.',
  'ShieldCheck',
  '3X ROI WARRANTY',
  ARRAY['duplicate-invoice-detection', 'missed-tax-exemption-audit', 'unclaimed-credit-recovery', 'automated-clawback-dispatch'],
  FALSE
),
(
  'CONNECTORS',
  'Universal Enterprise Connector Hub',
  'INTEGRATION',
  800.00,
  'Inbound webhook ingestion for Salesforce, Coupa, Plaid, SAP S/4HANA with HMAC validation, de-duplication, and DAG dispatch.',
  'Radio',
  'ACID HUB',
  ARRAY['webhook-ingestion', 'hmac-verification', 'deduplication-journal', 'polling-sync'],
  FALSE
),
(
  'WORKFLOWS',
  'Workflow Studio & Durable DAG Orchestrator',
  'ORCHESTRATION',
  1200.00,
  'Visual low-code DAG canvas, compensation rules, durable execution engine, and cross-module step dispatching.',
  'Zap',
  'DURABLE DAG',
  ARRAY['visual-canvas', 'durable-execution', 'step-compensation', 'multi-service-dispatch'],
  FALSE
),
(
  'TAX',
  'Enterprise Tax Nexus & Multi-Jurisdiction Engine',
  'FINANCIAL_OPERATIONS',
  950.00,
  'Statutory tax calculations across 50 US states and 27 EU member states, exemption certificate management, and nexus tracking.',
  'Building2',
  'STATUTORY',
  ARRAY['tax-nexus-evaluation', 'statutory-exemption-registry', 'audit-file-generation'],
  FALSE
),
(
  'SPEND',
  'Spend Management & AP Disbursement Studio',
  'FINANCIAL_OPERATIONS',
  1100.00,
  'Purchase order matching, 3-way reconciliation, AP invoice processing, and disbursement policy controls.',
  'CreditCard',
  'ACID AP',
  ARRAY['purchase-order-matching', 'disbursement-control', 'ap-ledger-reconciliation'],
  FALSE
),
(
  'AR',
  'Accounts Receivable & Revenue Inflow Engine',
  'FINANCIAL_OPERATIONS',
  1000.00,
  'Contract-based invoicing, WIP timesheet burndown, cost-plus margins, aging schedules, and collections automation.',
  'ArrowLeftRight',
  'LIVE LEDGER',
  ARRAY['invoice-issuance', 'wip-burndown', 'cost-plus-margins', 'aging-schedule'],
  FALSE
),
(
  'CURRENCY',
  'MultiCurrency FX & Global Treasury Engine',
  'TREASURY',
  750.00,
  'Interbank FX spot rates, spread slippage audits, multi-currency ledger conversions, and currency locale switching.',
  'Coins',
  'TREASURY',
  ARRAY['fx-spot-rates', 'treasury-spread-audit', 'currency-normalization'],
  FALSE
),
(
  'RULES',
  'Universal Rule Pro & Policy Decision Engine',
  'GOVERNANCE',
  600.00,
  'Abstract Syntax Tree (AST) deterministic policy evaluator, rule chaining, decision tables, and compliance gates.',
  'Scale',
  'AST ENGINE',
  ARRAY['ast-rule-evaluation', 'decision-matrices', 'compliance-gates'],
  FALSE
),
(
  'DATA_STUDIO',
  'Universal Data Studio & Schema Governance',
  'DATA_MANAGEMENT',
  600.00,
  'Data contracts, schema validation, semantic mapping, and enterprise ETL pipeline orchestration.',
  'Database',
  'SCHEMAS',
  ARRAY['schema-validation', 'data-contracts', 'semantic-mapping'],
  FALSE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  description = EXCLUDED.description;

-- Seed Global Platform Settings Store
INSERT INTO gigalibs_platform.platform_settings (key, value, category, description, is_secret) VALUES
(
  'system.maintenance_mode',
  '{"enabled": false, "message": null, "allowed_ips": ["127.0.0.1"]}'::jsonb,
  'SYSTEM',
  'Global platform maintenance mode switch. Bypassed for Super Admins.',
  FALSE
),
(
  'security.mfa_policy',
  '{"enforcement": "MANDATORY_FOR_ADMINS", "allowed_methods": ["TOTP", "WEBAUTHN"], "grace_period_days": 7}'::jsonb,
  'SECURITY',
  'Platform-wide Multi-Factor Authentication requirement.',
  FALSE
),
(
  'security.session_policy',
  '{"idle_timeout_minutes": 30, "max_lifetime_hours": 24, "revoke_on_ip_change": false}'::jsonb,
  'SECURITY',
  'Session lifetime and idle revocation controls.',
  FALSE
),
(
  'egress.email_gateway',
  '{"provider": "RESEND", "from_email": "notifications@gigalibs.io", "smtp_host": "smtp.resend.com", "port": 587}'::jsonb,
  'EGRESS',
  'System transactional email service configuration.',
  FALSE
),
(
  'feature_flags.zero_ghost_schemas',
  '{"enabled": true, "strict_mode": true}'::jsonb,
  'FEATURE_FLAGS',
  'Enforces zero schema allocation for unpurchased microservices.',
  FALSE
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Seed Platform Super Admins and Staff
INSERT INTO gigalibs_platform.platform_users (
  id, email, password_hash, name, platform_role, mfa_enabled, status
) VALUES
(
  'USR-PLATFORM-001',
  'admin@gigalibs.io',
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dGVzdGhhc2hmaXh0dXJl',
  'Platform Super Administrator',
  'SUPER_ADMIN',
  TRUE,
  'ACTIVE'
),
(
  'USR-PLATFORM-002',
  'sre@gigalibs.io',
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dGVzdGhhc2hmaXh0dXJl',
  'Lead SRE Operations',
  'OPERATIONS',
  TRUE,
  'ACTIVE'
),
(
  'USR-PLATFORM-003',
  'compliance@gigalibs.io',
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dGVzdGhhc2hmaXh0dXJl',
  'Chief Security & Compliance Officer',
  'SECURITY_OFFICER',
  TRUE,
  'ACTIVE'
)
ON CONFLICT (email) DO NOTHING;

-- Seed Initial Tenants Fleet
INSERT INTO gigalibs_platform.platform_tenants (
  id, name, slug, subdomain, custom_domain, status, plan_tier, entitled_modules, primary_contact_email, allocated_schemas, storage_usage_bytes
) VALUES
(
  'TEN-ACME-01',
  'Acme Healthcare Systems',
  'acme',
  'acme',
  'app.acmehealthcare.example.com',
  'ACTIVE',
  'ENTERPRISE',
  ARRAY['RECOVERY', 'CONNECTORS', 'WORKFLOWS'],
  'cfo@acmehealthcare.example.com',
  ARRAY['tenant_acme_recovery', 'tenant_acme_connectors', 'tenant_acme_workflows'],
  142857140
),
(
  'TEN-NORDIC-02',
  'Nordic Retail Group',
  'nordic',
  'nordic',
  'erp.nordicretail.example.com',
  'ACTIVE',
  'GROWTH',
  ARRAY['AR', 'TAX', 'CURRENCY'],
  'finance@nordicretail.example.com',
  ARRAY['tenant_nordic_ar', 'tenant_nordic_tax', 'tenant_nordic_currency'],
  89230410
),
(
  'TEN-APEX-03',
  'Apex Global Logistics',
  'apex',
  'apex',
  NULL,
  'ACTIVE',
  'ENTERPRISE',
  ARRAY['RECOVERY', 'CONNECTORS'],
  'admin@apexlogistics.example.com',
  ARRAY['tenant_apex_recovery', 'tenant_apex_connectors'],
  42190000
)
ON CONFLICT (slug) DO NOTHING;

-- Seed Sample Corporate Invoices and Module Purchases
INSERT INTO gigalibs_platform.billing_invoices (
  id, invoice_number, tenant_id, total_usd, payment_method, status, line_items, issued_at, paid_at
) VALUES
(
  'INV-2026-001',
  'INV-ACME-2026-09',
  'TEN-ACME-01',
  3500.00,
  'CORPORATE_INVOICED_LEDGER',
  'PAID',
  '[
    {"module": "RECOVERY", "name": "Autonomous Cash Recovery Studio", "price": 1500.00},
    {"module": "CONNECTORS", "name": "Universal Enterprise Connector Hub", "price": 800.00},
    {"module": "WORKFLOWS", "name": "Workflow Studio & Durable DAG Orchestrator", "price": 1200.00}
  ]'::jsonb,
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (invoice_number) DO NOTHING;

INSERT INTO gigalibs_platform.module_purchases (
  id, tenant_id, module_code, invoice_id, billing_cycle, amount_usd, status, purchased_by, purchased_at
) VALUES
(
  'PUR-ACME-REC',
  'TEN-ACME-01',
  'RECOVERY',
  'INV-2026-001',
  'MONTHLY',
  1500.00,
  'SETTLED',
  'cfo@acmehealthcare.example.com',
  NOW() - INTERVAL '5 days'
),
(
  'PUR-ACME-CONN',
  'TEN-ACME-01',
  'CONNECTORS',
  'INV-2026-001',
  'MONTHLY',
  800.00,
  'SETTLED',
  'cfo@acmehealthcare.example.com',
  NOW() - INTERVAL '5 days'
),
(
  'PUR-ACME-WF',
  'TEN-ACME-01',
  'WORKFLOWS',
  'INV-2026-001',
  'MONTHLY',
  1200.00,
  'SETTLED',
  'cfo@acmehealthcare.example.com',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- Seed Sovereign Platform Audit Event
INSERT INTO gigalibs_platform.platform_audit_events (
  id, event_type, actor_id, actor_email, actor_role, target_entity_type, target_entity_id, payload, ip_address, created_at
) VALUES
(
  'AUD-PLT-001',
  'TENANT_PROVISIONED',
  'USR-PLATFORM-001',
  'admin@gigalibs.io',
  'SUPER_ADMIN',
  'platform_tenants',
  'TEN-ACME-01',
  '{"name": "Acme Healthcare Systems", "subdomain": "acme", "modules": ["RECOVERY", "CONNECTORS", "WORKFLOWS"], "tier": "ENTERPRISE"}'::jsonb,
  '127.0.0.1',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;
