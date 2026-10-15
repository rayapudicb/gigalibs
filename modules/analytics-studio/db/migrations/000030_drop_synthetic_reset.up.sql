-- WI-OI-120ak (L2, Security review of release 162508b): the Demo Lab is removed (S5), nothing calls
-- reset_synthetic_facts, and UAT holds no SYNTHETIC facts. The function ran as its superuser owner, any role could
-- execute it, and its tenant check trusted a session setting, so it is dropped. refresh_place_rollup_statistics, from
-- the same migration, stays: place rollups call it. The DEMO_DATA_* audit and lineage enum values stay, because audit
-- rows use them. Forward-only.
BEGIN;

DROP FUNCTION IF EXISTS gigalibs_analytics.reset_synthetic_facts(text);

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (30, '000030_drop_synthetic_reset')
ON CONFLICT (version) DO NOTHING;

COMMIT;
