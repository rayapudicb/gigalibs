-- WI-OI-167 (R5 Workforce, ADR-0018 D3): a work requirement may belong to an organization unit, so a supervisor limited
-- to their units sees and staffs only their units' demand (and the shared demand everyone may read). Additive and
-- forward-only: one nullable column and an index; existing requirements stay shared (NULL). The table keeps its forced
-- row-level security. Recovery: the down migration drops the column while no requirement names a unit.
BEGIN;

ALTER TABLE gigalibs_workforce.work_requirements
  ADD COLUMN organization_unit_id varchar(64) CHECK (char_length(organization_unit_id) BETWEEN 1 AND 64);

CREATE INDEX work_requirements_unit ON gigalibs_workforce.work_requirements (tenant_id, organization_unit_id)
  WHERE organization_unit_id IS NOT NULL;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (30, '000030_workforce_requirement_owning_unit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
