-- WI-OI-104e: a rebuilt dataset of the same mapping version moves the semantic models on it to the new version (a
-- refresh); that move is audited. The enum value has its own migration (a value added and used in one transaction
-- fails on a fresh database). Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'SEMANTIC_MODEL_REFRESHED';

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (24, '000024_model_refresh_audit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
