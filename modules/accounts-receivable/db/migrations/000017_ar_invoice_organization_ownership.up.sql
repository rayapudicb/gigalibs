-- WI-OI-123: preserve explicit Orders ownership on canonical AR invoices.
-- Historical rows remain NULL until reconciled from their source document; credit checks fail closed for them.
BEGIN;

ALTER TABLE gigalibs_ar.invoice_drafts
  ADD COLUMN org_unit_id varchar(64);
ALTER TABLE gigalibs_ar.invoices
  ADD COLUMN org_unit_id varchar(64);
ALTER TABLE gigalibs_ar.invoices
  ADD COLUMN source_fulfillment_id uuid;

ALTER TABLE gigalibs_ar.invoice_drafts
  ADD CONSTRAINT invoice_drafts_org_unit_nonempty
  CHECK (org_unit_id IS NULL OR length(btrim(org_unit_id)) > 0);
ALTER TABLE gigalibs_ar.invoices
  ADD CONSTRAINT invoices_org_unit_nonempty
  CHECK (org_unit_id IS NULL OR length(btrim(org_unit_id)) > 0);

CREATE INDEX invoice_drafts_org_scope ON gigalibs_ar.invoice_drafts (tenant_id, org_unit_id, status);
CREATE INDEX invoices_org_scope ON gigalibs_ar.invoices (tenant_id, org_unit_id, issued_at);
CREATE UNIQUE INDEX invoices_source_fulfillment_unique
  ON gigalibs_ar.invoices (tenant_id, source_fulfillment_id)
  WHERE source_fulfillment_id IS NOT NULL;

-- Existing NULL owners are retained for reconciliation. Every new document has an
-- owner, and a reconciled owner cannot subsequently move between units.
CREATE FUNCTION gigalibs_ar.require_invoice_organization_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.org_unit_id IS NULL THEN
    RAISE EXCEPTION 'An owning organization unit is required for a new invoice document';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.org_unit_id IS NOT NULL AND NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id THEN
    RAISE EXCEPTION 'An invoice organization owner is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_drafts_organization_owner
  BEFORE INSERT OR UPDATE ON gigalibs_ar.invoice_drafts
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.require_invoice_organization_owner();
CREATE TRIGGER invoices_organization_owner
  BEFORE INSERT OR UPDATE ON gigalibs_ar.invoices
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.require_invoice_organization_owner();

CREATE TABLE gigalibs_ar.org_replica_versions (
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

CREATE TABLE gigalibs_ar.org_replica_units (
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
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_ar.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE gigalibs_ar.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_ar.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_closure_descendant ON gigalibs_ar.org_replica_closure (tenant_id, version_id, descendant_unit_id);

ALTER TABLE gigalibs_ar.org_replica_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.org_replica_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_versions_tenant_isolation ON gigalibs_ar.org_replica_versions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE gigalibs_ar.org_replica_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.org_replica_units FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_units_tenant_isolation ON gigalibs_ar.org_replica_units
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE gigalibs_ar.org_replica_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.org_replica_closure FORCE ROW LEVEL SECURITY;
CREATE POLICY org_replica_closure_tenant_isolation ON gigalibs_ar.org_replica_closure
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (17, '000017_ar_invoice_organization_ownership');

COMMIT;
