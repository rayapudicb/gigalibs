BEGIN;

-- WI-OI-154 / WI-OI-107: Product Catalogue keeps its section of the tenant's active industry pack and applies units
-- and categories the tenant does not have yet (by code).
CREATE TABLE gigalibs_product_catalogue.pack_sections (
  tenant_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('INDUSTRY', 'COUNTRY')),
  pack_key VARCHAR(64) NOT NULL,
  pack_version VARCHAR(16) NOT NULL,
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  published_version_id VARCHAR(64) NOT NULL,
  section JSONB NOT NULL CHECK (jsonb_typeof(section) = 'object'),
  applied_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

ALTER TABLE gigalibs_product_catalogue.pack_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_product_catalogue.pack_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_sections_tenant_isolation ON gigalibs_product_catalogue.pack_sections
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_product_catalogue.schema_migrations (version, name)
VALUES (3, '000003_product_catalogue_pack_sections');

COMMIT;
