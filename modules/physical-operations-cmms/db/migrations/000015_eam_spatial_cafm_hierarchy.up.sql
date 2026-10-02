-- WI-EAM-001: Enterprise Spatial Topology, CAFM Hierarchy & CAD/BIM Foundation
-- Introduces cmms_spaces for multi-tier physical space containment (Site -> Building -> Floor -> Room -> Zone),
-- links assets to space_id, and attaches 2D CAD layer GeoJSON and 3D BIM GUID anchors.
BEGIN;

CREATE TABLE gigalibs_cmms.cmms_spaces (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  code             text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text CHECK (char_length(description) <= 4000),
  space_type       text NOT NULL CHECK (space_type IN ('SITE', 'BUILDING', 'FLOOR', 'ROOM', 'ZONE')),
  parent_space_id  uuid,
  site_ref         uuid,
  floor_number     integer,
  gross_area_sqm   numeric(10, 2) CHECK (gross_area_sqm >= 0),
  net_area_sqm     numeric(10, 2) CHECK (net_area_sqm >= 0),
  cad_layer        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cad_layer) = 'object'),
  bim_guid         text CHECK (char_length(bim_guid) <= 128),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by       gigalibs_cmms.principal_ref NOT NULL,
  updated_by       gigalibs_cmms.principal_ref NOT NULL,
  correlation_id   text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_spaces_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT cmms_spaces_parent_fk FOREIGN KEY (tenant_id, parent_space_id)
    REFERENCES gigalibs_cmms.cmms_spaces (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cmms_spaces_not_own_parent CHECK (parent_space_id IS NULL OR parent_space_id <> id)
);

CREATE INDEX cmms_spaces_by_parent ON gigalibs_cmms.cmms_spaces (tenant_id, parent_space_id);
CREATE INDEX cmms_spaces_by_type ON gigalibs_cmms.cmms_spaces (tenant_id, space_type);
CREATE INDEX cmms_spaces_by_bim ON gigalibs_cmms.cmms_spaces (tenant_id, bim_guid) WHERE bim_guid IS NOT NULL;
CREATE INDEX cmms_spaces_by_site ON gigalibs_cmms.cmms_spaces (tenant_id, site_ref) WHERE site_ref IS NOT NULL;

-- Bind assets to space
ALTER TABLE gigalibs_cmms.assets
  ADD COLUMN space_id uuid;

ALTER TABLE gigalibs_cmms.assets
  ADD CONSTRAINT assets_space_fk FOREIGN KEY (tenant_id, space_id)
    REFERENCES gigalibs_cmms.cmms_spaces (tenant_id, id) ON DELETE SET NULL;

CREATE INDEX assets_by_space ON gigalibs_cmms.assets (tenant_id, space_id) WHERE space_id IS NOT NULL;

-- Enable and force Row-Level Security
ALTER TABLE gigalibs_cmms.cmms_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_spaces FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_spaces_tenant_isolation ON gigalibs_cmms.cmms_spaces
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (15, '000015_eam_spatial_cafm_hierarchy');

COMMIT;
