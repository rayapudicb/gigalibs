-- WI-OI-109e3: internal domain facts are a first-class Analytics source, distinct from external Connector Hub data.
-- PostgreSQL enum values must commit before a following migration uses them, so the table shape follows in 000029.
BEGIN;

ALTER TYPE gigalibs_analytics.external_source_type ADD VALUE IF NOT EXISTS 'MODULE_EVENTS';

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (28, '000028_module_event_source_type')
ON CONFLICT (version) DO NOTHING;

COMMIT;
