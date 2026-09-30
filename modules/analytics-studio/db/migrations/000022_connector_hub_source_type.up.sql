-- WI-OI-104e: a source type for records delivered by Connector Hub. The new enum value gets its own migration: a
-- value added and used in one transaction fails on a fresh database (55P04), so 000023 uses it. Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.external_source_type ADD VALUE IF NOT EXISTS 'CONNECTOR_HUB';

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (22, '000022_connector_hub_source_type')
ON CONFLICT (version) DO NOTHING;

COMMIT;
