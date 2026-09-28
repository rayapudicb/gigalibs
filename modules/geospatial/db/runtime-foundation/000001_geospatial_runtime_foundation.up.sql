-- WI-OI-063 fresh-install manifest for the canonical gigalibs_geospatial schema. The prototype
-- gigalibs_spatial migrations in db/migrations remain immutable source inventory and are
-- intentionally not part of this chain.
BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_geospatial;

CREATE TABLE gigalibs_geospatial.schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (1, '000001_geospatial_runtime_foundation');

COMMIT;
