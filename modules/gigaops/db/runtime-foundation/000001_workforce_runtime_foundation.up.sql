-- WI-OI-060 fresh-install manifest. The prototype gigalibs_gigaops migrations
-- remain immutable source inventory and are intentionally not part of this chain.
BEGIN;

CREATE SCHEMA IF NOT EXISTS gigalibs_workforce;

CREATE TABLE gigalibs_workforce.schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (1, '000001_workforce_runtime_foundation');

COMMIT;
