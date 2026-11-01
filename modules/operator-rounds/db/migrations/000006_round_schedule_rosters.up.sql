-- WI-OI-133: governed operator roster for published-route occurrence generation.
-- Additive; old assignment readers and writers remain compatible.
BEGIN;

CREATE TABLE gigalibs_operator_rounds.route_rosters (
  tenant_id varchar(64) NOT NULL,
  route_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  entries jsonb NOT NULL CHECK (jsonb_typeof(entries)='array' AND jsonb_array_length(entries)<=10),
  updated_by varchar(128) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,route_id),
  FOREIGN KEY (tenant_id,route_id)
    REFERENCES gigalibs_operator_rounds.route_templates(tenant_id,id)
);
ALTER TABLE gigalibs_operator_rounds.route_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_operator_rounds.route_rosters FORCE ROW LEVEL SECURITY;
CREATE POLICY route_rosters_tenant_isolation ON gigalibs_operator_rounds.route_rosters
  FOR ALL USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),''));

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(6,'000006_round_schedule_rosters');
COMMIT;
