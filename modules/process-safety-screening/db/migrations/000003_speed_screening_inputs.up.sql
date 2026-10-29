-- SPEED screening inputs (WI-OI-120by, SPEED S5; plan v1.4 §4.2). Forward-only; structure only, no business rows.
--
-- Library sets (the reference data the engines read), cited thermal data per step, the step's ΔHr source, energetic
-- groups on materials, the step's mitigation text, and the library each result used.

BEGIN;

-- Screening library sets: reaction classes, formation enthalpies, gases, materials' reactivity classes, interaction
-- rules and energetic groups, each entry with its citation. An administrator imports a cited pack; every entry is
-- unreviewed until the process safety specialist approves it (R2). One set is in force per workspace; a set's content
-- never changes and a set is never deleted. Results record the set they used.
CREATE TABLE gigalibs_speed.library_sets (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  version_label varchar(64) NOT NULL CHECK (char_length(btrim(version_label)) > 0 AND version_label = btrim(version_label)),
  source varchar(1000) NOT NULL CHECK (char_length(btrim(source)) > 0),
  library jsonb NOT NULL CHECK (jsonb_typeof(library) = 'object'),
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
CREATE UNIQUE INDEX library_sets_tenant_label ON gigalibs_speed.library_sets (tenant_id, lower(version_label));
CREATE UNIQUE INDEX library_sets_one_in_force ON gigalibs_speed.library_sets (tenant_id) WHERE in_force;

CREATE FUNCTION gigalibs_speed.keep_library_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SPEED library sets are never deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.library IS DISTINCT FROM OLD.library
     OR NEW.version_label IS DISTINCT FROM OLD.version_label OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'SPEED library content never changes; import a new set' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER library_sets_content_fixed BEFORE UPDATE OR DELETE ON gigalibs_speed.library_sets
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.keep_library_content();

-- Thermal data of a step's reaction mixture, each value measured or taken from literature and cited. One value of each
-- kind is active; a new one supersedes it, and a value is never edited. A removed step takes its data with it (the
-- removal is audited with what the step held).
CREATE TABLE gigalibs_speed.thermal_data (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  step_id uuid NOT NULL,
  kind varchar(32) NOT NULL CHECK (kind IN ('REACTION_ENTHALPY', 'DSC_ONSET', 'TD24', 'DECOMPOSITION_KINETICS')),
  reaction_enthalpy_kj_per_mol numeric(12, 4),
  onset_c numeric(9, 3),
  td24_c numeric(9, 3),
  activation_energy_kj_per_mol numeric(10, 4),
  heat_release_rate_w_per_kg numeric(20, 10) CHECK (heat_release_rate_w_per_kg IS NULL OR heat_release_rate_w_per_kg > 0),
  reference_temperature_c numeric(9, 3),
  basis varchar(16) NOT NULL CHECK (basis IN ('MEASURED', 'LITERATURE')),
  citation varchar(1000) NOT NULL CHECK (char_length(btrim(citation)) > 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUPERSEDED')),
  superseded_by varchar(128),
  superseded_at timestamptz,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, step_id) REFERENCES gigalibs_speed.steps (tenant_id, id) ON DELETE CASCADE,
  CHECK ((kind = 'REACTION_ENTHALPY') = (reaction_enthalpy_kj_per_mol IS NOT NULL)),
  CHECK ((kind = 'DSC_ONSET') = (onset_c IS NOT NULL)),
  CHECK ((kind = 'TD24') = (td24_c IS NOT NULL)),
  CHECK ((kind = 'DECOMPOSITION_KINETICS') = (activation_energy_kj_per_mol IS NOT NULL AND heat_release_rate_w_per_kg IS NOT NULL
    AND reference_temperature_c IS NOT NULL)),
  CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL AND superseded_by IS NOT NULL))
);
CREATE UNIQUE INDEX thermal_data_one_active ON gigalibs_speed.thermal_data (tenant_id, step_id, kind) WHERE status = 'ACTIVE';

CREATE FUNCTION gigalibs_speed.keep_thermal_values() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status', 'superseded_by', 'superseded_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'superseded_by', 'superseded_at']) THEN
    RAISE EXCEPTION 'SPEED thermal data are never edited; add a new value' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'A superseded SPEED thermal value stays superseded' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER thermal_data_values_fixed BEFORE UPDATE ON gigalibs_speed.thermal_data
FOR EACH ROW EXECUTE FUNCTION gigalibs_speed.keep_thermal_values();

-- The step's ΔHr source (FR-THM-01 to 03): a cited value (the active REACTION_ENTHALPY thermal data), a library reaction
-- class (always an estimate, BRL-05) or Hess's law from the library's formation enthalpies.
ALTER TABLE gigalibs_speed.step_conditions
  ADD COLUMN reaction_enthalpy_source varchar(16) CHECK (reaction_enthalpy_source IN ('MANUAL', 'REACTION_CLASS', 'HESS')),
  ADD COLUMN reaction_class_id varchar(64),
  ADD CONSTRAINT step_conditions_reaction_class CHECK ((reaction_enthalpy_source = 'REACTION_CLASS') = (reaction_class_id IS NOT NULL));

-- Energetic groups tagged on a material (FR-OB-04; manual in R1), ids from the library in force.
ALTER TABLE gigalibs_speed.step_materials
  ADD COLUMN energetic_groups varchar(64)[] NOT NULL DEFAULT '{}' CHECK (cardinality(energetic_groups) <= 20);

-- The mitigation a class 4 or 5 step needs (BRL-03): recorded in a draft; accepted by the safety reviewer in R2.
CREATE TABLE gigalibs_speed.mitigations (
  tenant_id varchar(64) NOT NULL,
  step_id uuid NOT NULL,
  text text NOT NULL CHECK (char_length(btrim(text)) > 0 AND char_length(text) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  recorded_by varchar(128) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  accepted_by varchar(128),
  accepted_at timestamptz,
  PRIMARY KEY (tenant_id, step_id),
  FOREIGN KEY (tenant_id, step_id) REFERENCES gigalibs_speed.steps (tenant_id, id) ON DELETE CASCADE,
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL))
);

-- The library each result used.
ALTER TABLE gigalibs_speed.results
  ADD COLUMN library_set_id uuid,
  ADD COLUMN library_version varchar(64),
  ADD COLUMN library_reviewed boolean,
  ADD CONSTRAINT results_library FOREIGN KEY (tenant_id, library_set_id) REFERENCES gigalibs_speed.library_sets (tenant_id, id),
  ADD CONSTRAINT results_library_stamp CHECK (
    (library_set_id IS NULL) = (library_version IS NULL) AND (library_set_id IS NULL) = (library_reviewed IS NULL)
  );

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['library_sets', 'thermal_data', 'mitigations'] LOOP
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
VALUES (3, '000003_speed_screening_inputs');

COMMIT;
