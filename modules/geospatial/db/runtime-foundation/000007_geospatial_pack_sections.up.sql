BEGIN;

-- WI-OI-107 (ADR-0016 F10, owner decision D3): Geospatial keeps its own copy of its section of the tenant's active
-- industry pack (the place levels), sent by the kernel's `pack.apply` job when a pack is activated in Configuration
-- Studio. Applying it adds the place types the tenant does not have yet; existing types are never changed.
CREATE TABLE gigalibs_geospatial.pack_sections (
  tenant_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('INDUSTRY', 'COUNTRY')),
  pack_key VARCHAR(64) NOT NULL,
  pack_version VARCHAR(16) NOT NULL,
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  published_version_id UUID NOT NULL,
  section JSONB NOT NULL CHECK (jsonb_typeof(section) = 'object'),
  applied_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

ALTER TABLE gigalibs_geospatial.pack_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_geospatial.pack_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_sections_tenant_isolation ON gigalibs_geospatial.pack_sections
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (7, '000007_geospatial_pack_sections');

COMMIT;
