-- WI-EAM-002: Technical Asset Engineering Taxonomy, Specification Attributes & Status Cascading
-- Introduces cmms_asset_classifications, cmms_asset_spec_definitions, and cmms_asset_specs
-- for engineering taxonomy, parametric specifications (UoM/min/max), and links assets to classification_id.
BEGIN;

CREATE TABLE gigalibs_cmms.cmms_asset_classifications (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  code             text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text CHECK (char_length(description) <= 4000),
  parent_class_id  uuid,
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by       gigalibs_cmms.principal_ref NOT NULL,
  updated_by       gigalibs_cmms.principal_ref NOT NULL,
  correlation_id   text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_classifications_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT cmms_classifications_parent_fk FOREIGN KEY (tenant_id, parent_class_id)
    REFERENCES gigalibs_cmms.cmms_asset_classifications (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX cmms_classifications_parent ON gigalibs_cmms.cmms_asset_classifications (tenant_id, parent_class_id);

CREATE TABLE gigalibs_cmms.cmms_asset_spec_definitions (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  classification_id  uuid NOT NULL,
  attribute_key      text NOT NULL CHECK (attribute_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label              text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  data_type          text NOT NULL CHECK (data_type IN ('NUMBER', 'TEXT', 'BOOLEAN', 'DATE')),
  uom                text CHECK (char_length(uom) <= 32),
  required           boolean NOT NULL DEFAULT false,
  min_value          numeric(16, 4),
  max_value          numeric(16, 4),
  default_value      text,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by         gigalibs_cmms.principal_ref NOT NULL,
  updated_by         gigalibs_cmms.principal_ref NOT NULL,
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_spec_defs_key_unique UNIQUE (tenant_id, classification_id, attribute_key),
  CONSTRAINT cmms_spec_defs_class_fk FOREIGN KEY (tenant_id, classification_id)
    REFERENCES gigalibs_cmms.cmms_asset_classifications (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX cmms_spec_defs_by_class ON gigalibs_cmms.cmms_asset_spec_definitions (tenant_id, classification_id);

CREATE TABLE gigalibs_cmms.cmms_asset_specs (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  asset_id            uuid NOT NULL,
  spec_definition_id  uuid NOT NULL,
  value_text          text,
  value_number        numeric(16, 4),
  value_boolean       boolean,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, asset_id, spec_definition_id),
  CONSTRAINT cmms_asset_specs_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cmms_asset_specs_def_fk FOREIGN KEY (tenant_id, spec_definition_id)
    REFERENCES gigalibs_cmms.cmms_asset_spec_definitions (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX cmms_asset_specs_by_asset ON gigalibs_cmms.cmms_asset_specs (tenant_id, asset_id);

ALTER TABLE gigalibs_cmms.assets
  ADD COLUMN classification_id uuid;

ALTER TABLE gigalibs_cmms.assets
  ADD CONSTRAINT assets_classification_fk FOREIGN KEY (tenant_id, classification_id)
    REFERENCES gigalibs_cmms.cmms_asset_classifications (tenant_id, id) ON DELETE SET NULL;

CREATE INDEX assets_by_classification ON gigalibs_cmms.assets (tenant_id, classification_id) WHERE classification_id IS NOT NULL;

-- Row Level Security
ALTER TABLE gigalibs_cmms.cmms_asset_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_asset_classifications FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_classifications_tenant_isolation ON gigalibs_cmms.cmms_asset_classifications
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

ALTER TABLE gigalibs_cmms.cmms_asset_spec_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_asset_spec_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_spec_defs_tenant_isolation ON gigalibs_cmms.cmms_asset_spec_definitions
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

ALTER TABLE gigalibs_cmms.cmms_asset_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_asset_specs FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_asset_specs_tenant_isolation ON gigalibs_cmms.cmms_asset_specs
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (16, '000016_eam_asset_classification_and_specs');

COMMIT;
