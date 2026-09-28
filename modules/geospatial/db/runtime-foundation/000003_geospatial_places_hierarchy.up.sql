BEGIN;

-- WI-OI-063b / ADR-0006: Geospatial is the single place master. Node types are tenant reference data;
-- the hierarchy is an ltree path per tenant whose last label is the node code. Other modules reference
-- nodes by ID (site_ref) plus a path snapshot and never join these tables.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE gigalibs_geospatial.spatial_node_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  label VARCHAR(120) NOT NULL CHECK (length(btrim(label)) > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_geospatial.spatial_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  parent_id UUID,
  node_type_id UUID NOT NULL,
  code VARCHAR(63) NOT NULL CHECK (code ~ '^[A-Za-z0-9_]{1,63}$'),
  path ltree NOT NULL,
  display_name VARCHAR(200) NOT NULL CHECK (length(btrim(display_name)) > 0),
  country_code CHAR(2) CHECK (country_code ~ '^[A-Z]{2}$'),
  subdivision_code VARCHAR(6) CHECK (subdivision_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  time_zone VARCHAR(64) CHECK (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  boundary JSONB CHECK (boundary IS NULL OR jsonb_typeof(boundary) = 'object'),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, path),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES gigalibs_geospatial.spatial_nodes (tenant_id, id),
  FOREIGN KEY (tenant_id, node_type_id) REFERENCES gigalibs_geospatial.spatial_node_types (tenant_id, id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (nlevel(path) BETWEEN 1 AND 32),
  CHECK (subpath(path, nlevel(path) - 1) = text2ltree(code)),
  CHECK ((parent_id IS NULL) = (nlevel(path) = 1)),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (subdivision_code IS NULL OR (country_code IS NOT NULL AND left(subdivision_code, 2) = country_code))
);

CREATE INDEX spatial_nodes_tenant_path ON gigalibs_geospatial.spatial_nodes USING gist (tenant_id, path);
CREATE INDEX spatial_nodes_tenant_parent ON gigalibs_geospatial.spatial_nodes (tenant_id, parent_id);
CREATE INDEX spatial_nodes_tenant_search
  ON gigalibs_geospatial.spatial_nodes (tenant_id, status, display_name);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['spatial_node_types', 'spatial_nodes']
  LOOP
    EXECUTE format('ALTER TABLE gigalibs_geospatial.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_geospatial.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_geospatial.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (3, '000003_geospatial_places_hierarchy');

COMMIT;
