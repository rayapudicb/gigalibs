-- WI-OI-059: governed connector type metadata only.
-- This migration intentionally creates no tenant connections, credentials, events or business values.

BEGIN;

INSERT INTO gigalibs_connectors.connector_definitions (
  id,
  connector_code,
  name,
  category,
  description,
  icon,
  auth_types,
  supported_events,
  status,
  created_at
) VALUES
  (
    'cdef-postgresql',
    'POSTGRESQL_DATABASE',
    'PostgreSQL Database',
    'DATABASE',
    'Read-only PostgreSQL source for governed schema discovery and bounded incremental ingestion.',
    'database',
    '["PASSWORD","MTLS_CERT"]'::jsonb,
    '["schema.discovered","sync.completed","sync.failed"]'::jsonb,
    'ACTIVE',
    now()
  ),
  (
    'cdef-webhook',
    'CUSTOM_WEBHOOK',
    'Universal Inbound Webhook',
    'GENERIC',
    'HMAC-SHA256 authenticated JSON event ingestion for tenant-owned systems.',
    'webhook',
    '["HMAC_SHA256"]'::jsonb,
    '["custom.event"]'::jsonb,
    'ACTIVE',
    now()
  ),
  (
    'cdef-salesforce',
    'SALESFORCE_CRM',
    'Salesforce CRM',
    'CRM',
    'Salesforce webhook and OAuth connector type; provider onboarding remains unavailable until configured.',
    'salesforce',
    '["WEBHOOK","OAUTH2"]'::jsonb,
    '["opportunity.closed_won","account.created","contract.signed"]'::jsonb,
    'ACTIVE',
    now()
  ),
  (
    'cdef-coupa',
    'COUPA_PROCUREMENT',
    'Coupa Procurement',
    'PROCUREMENT',
    'Coupa webhook and OAuth connector type; provider onboarding remains unavailable until configured.',
    'coupa',
    '["WEBHOOK","API_KEY","OAUTH2"]'::jsonb,
    '["requisition.created","purchase_order.approved","invoice.received"]'::jsonb,
    'ACTIVE',
    now()
  )
ON CONFLICT (connector_code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  auth_types = EXCLUDED.auth_types,
  supported_events = EXCLUDED.supported_events,
  status = EXCLUDED.status;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (4, '000004_connector_catalog_reference_data', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
