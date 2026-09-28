-- Universal Enterprise Connector Hub Seed Data
-- 1. Connector Definitions (Enterprise Integration Catalog)
INSERT INTO gigalibs_connectors.connector_definitions (
    id, connector_code, name, category, description, icon, auth_types, supported_events, status, created_at
) VALUES
(
    'cdef-sf',
    'SALESFORCE_CRM',
    'Salesforce Sales Cloud CRM',
    'CRM',
    'Inbound real-time webhook and CDC streaming for closed-won opportunities, enterprise accounts, and contracts.',
    'salesforce',
    '["WEBHOOK", "OAUTH2"]'::jsonb,
    '["opportunity.closed_won", "account.created", "contract.signed"]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days'
),
(
    'cdef-coupa',
    'COUPA_PROCUREMENT',
    'Coupa Business Spend Management',
    'PROCUREMENT',
    'Real-time purchase requisition approvals, PO line items, and invoice matching events.',
    'coupa',
    '["WEBHOOK", "API_KEY", "OAUTH2"]'::jsonb,
    '["requisition.created", "purchase_order.approved", "invoice.received"]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days'
),
(
    'cdef-plaid',
    'PLAID_STRIPE',
    'Plaid & Stripe Banking Network',
    'BANKING',
    'Continuous feed of authorized corporate card transactions, merchant categories, and treasury payouts.',
    'plaid',
    '["WEBHOOK", "MTLS_CERT"]'::jsonb,
    '["transaction.authorized", "payout.settled", "card.swipe"]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '25 days'
),
(
    'cdef-sap',
    'SAP_S4HANA',
    'SAP S/4HANA Cloud ERP',
    'ERP',
    'OData v4 and RFC bridge for double-entry subledger reconciliation and material master sync.',
    'sap',
    '["OAUTH2", "MTLS_CERT"]'::jsonb,
    '["billing_document.posted", "journal_entry.cleared"]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '20 days'
),
(
    'cdef-webhook',
    'CUSTOM_WEBHOOK',
    'Universal Inbound Webhook Bridge',
    'GENERIC',
    'High-throughput HMAC-SHA256 authenticated JSON webhook gateway for custom proprietary systems.',
    'webhook',
    '["WEBHOOK", "HMAC_SHA256"]'::jsonb,
    '["custom.event"]'::jsonb,
    'ACTIVE',
    NOW() - INTERVAL '30 days'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 2. Tenant Connections (Active tenant-scoped integration instances)
INSERT INTO gigalibs_connectors.tenant_connections (
    id, tenant_id, connector_code, name, slug, environment, auth_type, webhook_secret, target_workflow_code, configuration, status, last_sync_at, events_count, created_at, updated_at
) VALUES
(
    'conn-sf-01',
    'tenant-corp-01',
    'SALESFORCE_CRM',
    'Salesforce Global Enterprise Sales Stream',
    'salesforce-crm',
    'PRODUCTION',
    'WEBHOOK',
    'whsec_sf_prod_8829104aef9182bc',
    'WF-O2C-CROSS-BORDER',
    '{"instance_url": "https://corp01.my.salesforce.com", "api_version": "v59.0", "auto_trigger": true}'::jsonb,
    'READY',
    NOW() - INTERVAL '15 minutes',
    124,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '15 minutes'
),
(
    'conn-coupa-01',
    'tenant-corp-01',
    'COUPA_PROCUREMENT',
    'Coupa North America Spend Pipeline',
    'coupa-procure',
    'PRODUCTION',
    'WEBHOOK',
    'whsec_coupa_na_11928374a83c74',
    'WF-P2P-SPEND-APPROVAL',
    '{"domain": "corp01.coupahost.com", "spend_threshold_minor": 5000000, "auto_trigger": true}'::jsonb,
    'READY',
    NOW() - INTERVAL '45 minutes',
    89,
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '45 minutes'
),
(
    'conn-plaid-01',
    'tenant-corp-01',
    'PLAID_STRIPE',
    'Plaid Corporate Visa Feed',
    'plaid-cards',
    'PRODUCTION',
    'WEBHOOK',
    'whsec_plaid_live_99281734891b',
    'WF-P2P-SPEND-APPROVAL',
    '{"institution_id": "ins_109508", "auto_categorize": true}'::jsonb,
    'READY',
    NOW() - INTERVAL '2 hours',
    312,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '2 hours'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status;

-- 3. Raw Ingestion Journal (Sample Historical Audit Ingestion)
INSERT INTO gigalibs_connectors.raw_ingestion_journal (
    id, tenant_id, connection_id, idempotency_key, event_type, payload_sha256, raw_payload, headers, client_ip, status, dispatched_run_id, duration_ms, received_at
) VALUES
(
    'ing-sf-001',
    'tenant-corp-01',
    'conn-sf-01',
    'idemp-sf-deal-99120',
    'opportunity.closed_won',
    '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    '{"deal_id": "OPP-99120", "amount": 125000, "currency": "EUR", "customer_country": "DE", "customer_name": "Siemens Healthineers"}'::jsonb,
    '{"x-sfdc-signature": "verified", "content-type": "application/json"}'::jsonb,
    '136.146.210.12',
    'DISPATCHED',
    'run-o2c-99120',
    4,
    NOW() - INTERVAL '2 days'
),
(
    'ing-coupa-001',
    'tenant-corp-01',
    'conn-coupa-01',
    'idemp-coupa-req-4401',
    'requisition.created',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '{"requisition_id": "REQ-4401", "department": "ENGINEERING", "amount": 78500, "currency": "USD", "vendor": "NVIDIA Corp"}'::jsonb,
    '{"x-coupa-signature": "verified", "content-type": "application/json"}'::jsonb,
    '52.34.12.89',
    'DISPATCHED',
    'run-p2p-4401',
    6,
    NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Sync Jobs
INSERT INTO gigalibs_connectors.sync_jobs (
    id, tenant_id, connection_id, job_type, status, records_ingested, cursor_after, duration_ms, started_at, completed_at
) VALUES
(
    'job-sf-001',
    'tenant-corp-01',
    'conn-sf-01',
    'SCHEDULED',
    'COMPLETED',
    14,
    '2026-09-05T08:00:00.000Z',
    182,
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '4 hours' + INTERVAL '182 ms'
),
(
    'job-coupa-001',
    'tenant-corp-01',
    'conn-coupa-01',
    'SCHEDULED',
    'COMPLETED',
    8,
    '2026-09-05T09:30:00.000Z',
    115,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours' + INTERVAL '115 ms'
)
ON CONFLICT (id) DO NOTHING;
