-- WI-OI-131 (Phase A): catalogue entitlement key, contract metadata and lifecycle on module sources, plus a tenant
-- module-entitlement replica Analytics applies from signed control-plane snapshots. Forward-only and additive.
BEGIN;

ALTER TABLE gigalibs_analytics.source_connections
  ADD COLUMN catalog_module_key TEXT,
  ADD COLUMN contract_version INTEGER CHECK (contract_version IS NULL OR contract_version BETWEEN 1 AND 9999),
  ADD COLUMN owner_scope_policy TEXT CHECK (
    owner_scope_policy IS NULL
    OR owner_scope_policy IN ('UNIT_REQUIRED', 'TENANT_SHARED_EXPLICIT', 'PLACE_SCOPED')
  ),
  ADD COLUMN module_lifecycle TEXT CHECK (
    module_lifecycle IS NULL
    OR module_lifecycle IN ('NO_DATA', 'ACTIVE', 'UNAVAILABLE', 'QUARANTINED')
  );

CREATE TABLE gigalibs_analytics.tenant_module_entitlement_replica (
  tenant_id VARCHAR(64) NOT NULL,
  catalog_module_key VARCHAR(64) NOT NULL,
  snapshot_version BIGINT NOT NULL CHECK (snapshot_version >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ENABLED', 'DISABLED')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, catalog_module_key)
);

ALTER TABLE gigalibs_analytics.tenant_module_entitlement_replica ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.tenant_module_entitlement_replica FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_module_entitlement_replica_isolation
  ON gigalibs_analytics.tenant_module_entitlement_replica
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE INDEX tenant_module_entitlement_replica_tenant
  ON gigalibs_analytics.tenant_module_entitlement_replica (tenant_id);

-- Known legacy inbox keys (000029) backfill; anything else is quarantined until reviewed.
UPDATE gigalibs_analytics.source_connections
SET
  catalog_module_key = 'asset-maintenance',
  contract_version = 1,
  owner_scope_policy = 'UNIT_REQUIRED',
  module_lifecycle = 'ACTIVE'
WHERE module_source_key = 'cmms:downtime';

UPDATE gigalibs_analytics.source_connections
SET
  catalog_module_key = 'gigaops',
  contract_version = 1,
  owner_scope_policy = 'TENANT_SHARED_EXPLICIT',
  module_lifecycle = 'ACTIVE'
WHERE module_source_key = 'workforce:positions';

UPDATE gigalibs_analytics.source_connections
SET module_lifecycle = 'QUARANTINED'
WHERE module_source_key IS NOT NULL
  AND module_source_key NOT IN ('cmms:downtime', 'workforce:positions')
  AND module_lifecycle IS NULL;

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (31, '000031_module_source_entitlements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
