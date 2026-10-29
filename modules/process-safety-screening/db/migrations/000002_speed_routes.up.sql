-- SPEED routes (WI-OI-120bx, SPEED S4a; plan v1.4 §4.2). Forward-only; structure only, no business rows.
--
-- Screening criteria sets, substances, routes with their steps, materials and process conditions, and the immutable
-- screening results. Every table carries tenant_id with forced RLS; every reference between tables carries the tenant,
-- so no row can point into another workspace.

BEGIN;

-- Lets other tables reference a project together with its tenant.
ALTER TABLE gigalibs_speed.projects ADD CONSTRAINT projects_tenant_id_id UNIQUE (tenant_id, id);

-- Screening criteria: every threshold and range the engines apply, with a citation for every value. An administrator
-- imports a cited set (unreviewed until the process safety specialist approves it, R2); exactly one set is in force
-- per workspace; a set's values never change and a set is never deleted. Results record the set they used.
CREATE TABLE gigalibs_speed.criteria_sets (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  version_label varchar(64) NOT NULL CHECK (char_length(btrim(version_label)) > 0 AND version_label = btrim(version_label)),
  source varchar(1000) NOT NULL CHECK (char_length(btrim(source)) > 0),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'object'),
  citations jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'object'),
  review_status varchar(16) NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status IN ('UNREVIEWED', 'APPROVED')),
  in_force boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  imported_by varchar(128) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  in_force_by varchar(128),
  in_force_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  CHECK (NOT in_force OR (in_force_by IS NOT NULL AND in_force_since IS NOT NULL))
);
CREATE UNIQUE INDEX criteria_sets_tenant_label ON gigalibs_speed.criteria_sets (tenant_id, lower(version_label));
CREATE UNIQUE INDEX criteria_sets_one_in_force ON gigalibs_speed.criteria_sets (tenant_id) WHERE in_force;

CREATE FUNCTION gigalibs_speed.keep_criteria_values() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SPEED criteria sets are never deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.criteria IS DISTINCT FROM OLD.criteria
     OR NEW.citations IS DISTINCT FROM OLD.citations OR NEW.version_label IS DISTINCT FROM OLD.version_label
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'SPEED criteria values never change; import a new set' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER criteria_sets_values_fixed BEFORE UPDATE OR DELETE ON gigalibs_speed.criteria_sets
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.keep_criteria_values();

-- Substances are shared across the workspace's sites. The molar mass is computed on the server from the formula with
-- the element table recorded beside it. Archived, never deleted.
CREATE TABLE gigalibs_speed.substances (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  cas_number varchar(12) CHECK (cas_number IS NULL OR cas_number ~ '^[0-9]{2,7}-[0-9]{2}-[0-9]$'),
  formula varchar(200) NOT NULL CHECK (char_length(btrim(formula)) > 0),
  hill_formula varchar(200) NOT NULL,
  molar_mass_g_per_mol numeric(14, 6) NOT NULL CHECK (molar_mass_g_per_mol > 0),
  elements_version varchar(64) NOT NULL,
  density_g_per_ml numeric(10, 4) CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_by varchar(128),
  archived_at timestamptz,
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL AND archived_by IS NOT NULL))
);
CREATE UNIQUE INDEX substances_tenant_name ON gigalibs_speed.substances (tenant_id, lower(name));
CREATE INDEX substances_tenant_cas ON gigalibs_speed.substances (tenant_id, cas_number);

-- A route belongs to a project (and through it to a site). R1 routes are drafts; the R2 lifecycle extends the status.
CREATE TABLE gigalibs_speed.routes (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  project_id uuid NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  route_version integer NOT NULL DEFAULT 1 CHECK (route_version > 0),
  supersedes_id uuid,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ARCHIVED')),
  author_subject varchar(128) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_by varchar(128),
  archived_at timestamptz,
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_speed.projects (tenant_id, id),
  FOREIGN KEY (tenant_id, supersedes_id) REFERENCES gigalibs_speed.routes (tenant_id, id),
  CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL AND archived_by IS NOT NULL))
);
CREATE UNIQUE INDEX routes_project_name_version ON gigalibs_speed.routes (tenant_id, project_id, lower(name), route_version);
CREATE INDEX routes_tenant_updated ON gigalibs_speed.routes (tenant_id, updated_at DESC, id);

CREATE FUNCTION gigalibs_speed.refuse_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SPEED % are archived, never deleted', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
CREATE TRIGGER substances_never_deleted BEFORE DELETE ON gigalibs_speed.substances
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.refuse_delete();
CREATE TRIGGER routes_never_deleted BEFORE DELETE ON gigalibs_speed.routes
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.refuse_delete();

-- Steps, in order. A draft route's steps may be removed (audited with what they held).
CREATE TABLE gigalibs_speed.steps (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  route_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  CONSTRAINT steps_route_position UNIQUE (tenant_id, route_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, route_id) REFERENCES gigalibs_speed.routes (tenant_id, id)
);

-- A step's materials: a substance in a role, with its stoichiometric coefficient and charge. Coefficients belong to the
-- equation's roles; a by-product has no charge (FR-INP-02).
CREATE TABLE gigalibs_speed.step_materials (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  step_id uuid NOT NULL,
  substance_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  role varchar(16) NOT NULL CHECK (role IN ('Reactant', 'Additive', 'Solvent', 'Work-up', 'Product', 'By-product')),
  coefficient numeric(12, 6) CHECK (coefficient IS NULL OR coefficient > 0),
  mass_g numeric(18, 6) CHECK (mass_g IS NULL OR mass_g > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  CHECK (coefficient IS NULL OR role IN ('Reactant', 'Product', 'By-product')),
  CHECK (mass_g IS NULL OR role <> 'By-product'),
  FOREIGN KEY (tenant_id, step_id) REFERENCES gigalibs_speed.steps (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, substance_id) REFERENCES gigalibs_speed.substances (tenant_id, id)
);
CREATE INDEX step_materials_step ON gigalibs_speed.step_materials (tenant_id, step_id, position);
CREATE INDEX step_materials_substance ON gigalibs_speed.step_materials (tenant_id, substance_id);

-- A step's process conditions; ranges are checked against the criteria in force (BRD §15.1).
CREATE TABLE gigalibs_speed.step_conditions (
  tenant_id varchar(64) NOT NULL,
  step_id uuid NOT NULL,
  process_temperature_c numeric(9, 3),
  maximum_technical_temperature_c numeric(9, 3),
  heat_capacity_j_per_g_k numeric(9, 4),
  accumulation_percent numeric(7, 3) CHECK (accumulation_percent IS NULL OR accumulation_percent BETWEEN 0 AND 100),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by varchar(128) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step_id),
  FOREIGN KEY (tenant_id, step_id) REFERENCES gigalibs_speed.steps (tenant_id, id) ON DELETE CASCADE
);

-- Screening results: what the engines computed for one step from exactly these inputs. Append-only (the runtime role
-- may only insert, MODULE_APPEND_ONLY_TABLES); a recompute adds a row (NFR-10). A result outlives a removed step, so it
-- keeps the step's id without a reference.
CREATE TABLE gigalibs_speed.results (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  route_id uuid NOT NULL,
  step_id uuid NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('OK', 'DATA_GAP')),
  gate_pass boolean,
  engine_version varchar(64) NOT NULL,
  elements_version varchar(64) NOT NULL,
  criteria_set_id uuid,
  criteria_version varchar(64),
  criteria_reviewed boolean,
  inputs_hash char(64) NOT NULL CHECK (inputs_hash ~ '^[0-9a-f]{64}$'),
  inputs jsonb NOT NULL,
  outputs jsonb NOT NULL,
  computed_by varchar(128) NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, route_id) REFERENCES gigalibs_speed.routes (tenant_id, id),
  FOREIGN KEY (tenant_id, criteria_set_id) REFERENCES gigalibs_speed.criteria_sets (tenant_id, id),
  CHECK ((status = 'OK') = (gate_pass IS NOT NULL)),
  CHECK ((criteria_set_id IS NULL) = (criteria_version IS NULL) AND (criteria_set_id IS NULL) = (criteria_reviewed IS NULL))
);
CREATE INDEX results_step_latest ON gigalibs_speed.results (tenant_id, step_id, computed_at DESC);
CREATE INDEX results_route ON gigalibs_speed.results (tenant_id, route_id, computed_at DESC);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'criteria_sets', 'substances', 'routes', 'steps', 'step_materials', 'step_conditions', 'results'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_speed.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_speed.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_speed.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_speed.schema_migrations (version, name)
VALUES (2, '000002_speed_routes');

COMMIT;
