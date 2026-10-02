BEGIN;

-- WI-OI-109e2 (ADR-0018 §3): Analytics's copy of the organization versions the control plane activates,
-- received page by page through kernel module.call jobs, checked (count, parents, checksum) and expanded locally.
-- Generated from @gigalibs/module-sdk organizationReplicaDdl(); a test keeps this text equal to it.
CREATE TABLE gigalibs_analytics.org_replica_versions (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  tree_id VARCHAR(64) NOT NULL,
  tree_kind VARCHAR(16) NOT NULL CHECK (tree_kind IN ('PRIMARY', 'ALTERNATE')),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING', 'READY')),
  unit_count INTEGER CHECK (unit_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);

CREATE TABLE gigalibs_analytics.org_replica_units (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  unit_id VARCHAR(64) NOT NULL,
  parent_unit_id VARCHAR(64),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  holds_records BOOLEAN NOT NULL,
  type_code VARCHAR(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_analytics.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE gigalibs_analytics.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_analytics.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_closure_descendant ON gigalibs_analytics.org_replica_closure (tenant_id, version_id, descendant_unit_id);

ALTER TABLE gigalibs_analytics.org_replica_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.org_replica_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_versions_tenant_isolation ON gigalibs_analytics.org_replica_versions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE gigalibs_analytics.org_replica_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.org_replica_units FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_units_tenant_isolation ON gigalibs_analytics.org_replica_units
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE gigalibs_analytics.org_replica_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.org_replica_closure FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_closure_tenant_isolation ON gigalibs_analytics.org_replica_closure
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (27, '000027_organization_replica')
ON CONFLICT (version) DO NOTHING;

COMMIT;
