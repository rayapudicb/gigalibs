-- SPEED interactions (WI-OI-120bz, SPEED S6; plan v1.4 §4.2). Forward-only; structure only, no business rows.
--
-- A substance's link to a library material (its reactivity classes come from the library in force), and the controls
-- documented for interaction findings (BRL-04).

BEGIN;

-- The library material id in the library pack (`L01`); the classes it carries come from the set in force.
ALTER TABLE gigalibs_speed.substances
  ADD COLUMN library_material_id varchar(64) CHECK (library_material_id IS NULL OR char_length(btrim(library_material_id)) > 0);

-- The control documented for a finding between two materials of a step (BRL-04: mandatory for High findings). It goes
-- with either material if that material is removed; the removal is audited with what the step held.
CREATE TABLE gigalibs_speed.interaction_controls (
  tenant_id varchar(64) NOT NULL,
  step_id uuid NOT NULL,
  material_a_id uuid NOT NULL,
  material_b_id uuid NOT NULL,
  rule_id varchar(64) NOT NULL,
  text text NOT NULL CHECK (char_length(btrim(text)) > 0 AND char_length(text) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  documented_by varchar(128) NOT NULL,
  documented_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step_id, material_a_id, material_b_id),
  CHECK (material_a_id <> material_b_id),
  FOREIGN KEY (tenant_id, step_id) REFERENCES gigalibs_speed.steps (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, material_a_id) REFERENCES gigalibs_speed.step_materials (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, material_b_id) REFERENCES gigalibs_speed.step_materials (tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE gigalibs_speed.interaction_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_speed.interaction_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY interaction_controls_tenant_isolation ON gigalibs_speed.interaction_controls
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_speed.schema_migrations (version, name)
VALUES (4, '000004_speed_interactions');

COMMIT;
