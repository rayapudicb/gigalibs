BEGIN;

-- WI-OI-107 (ADR-0016 F10, owner decision D3): Workforce keeps its own copy of its section of the tenant's active
-- industry and country packs, sent by the kernel's `pack.apply` job when a pack is activated in Configuration Studio.
-- One row per pack kind; a newer activation replaces it, and re-activating an older version rolls it back.
CREATE TABLE gigalibs_workforce.pack_sections (
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

ALTER TABLE gigalibs_workforce.pack_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.pack_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_sections_tenant_isolation ON gigalibs_workforce.pack_sections
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (15, '000015_workforce_pack_sections');

COMMIT;
