-- WI-OI-103d d7: labelled synthetic sources for Demo Lab workspaces. A SYNTHETIC connection has no external system: its raw
-- records are generated inside Analytics and flow through the same discovery, mapping, dataset and model steps as
-- synced records. Sync refuses SYNTHETIC connections; connection tests find no credentials for them. Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.external_source_type ADD VALUE IF NOT EXISTS 'SYNTHETIC';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'DEMO_SOURCE_LOADED';

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (18, '000018_synthetic_sources', now());

COMMIT;
