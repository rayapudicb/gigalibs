BEGIN;

-- WI-OI-061 / ADR-0003 Decision 8: industry terms such as "crew" may not appear in canonical
-- schema values or API DTOs. The neutral grouped-resource type is TEAM. Existing CREW rows are
-- renamed with a version bump and an audit record; the new CHECK fails closed if any remain.

WITH renamed AS (
  UPDATE gigalibs_workforce.workforce_resources
  SET resource_type = 'TEAM',
      version = version + 1,
      updated_by = 'system:migration-000004',
      correlation_id = 'migration-000004',
      updated_at = now()
  WHERE resource_type = 'CREW'
  RETURNING id, tenant_id, version
)
INSERT INTO gigalibs_workforce.audit_events
  (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
SELECT
  'migration-000004-' || renamed.id::text,
  renamed.tenant_id,
  'system:migration-000004',
  'WORKFORCE_RESOURCE_TYPE_RENAMED',
  'WORKFORCE_RESOURCE',
  renamed.id::text,
  'migration-000004',
  jsonb_build_object('from', 'CREW', 'to', 'TEAM', 'version', renamed.version, 'reason', 'ADR-0003 lexicon')
FROM renamed;

ALTER TABLE gigalibs_workforce.workforce_resources
  DROP CONSTRAINT workforce_resources_resource_type_check;
ALTER TABLE gigalibs_workforce.workforce_resources
  ADD CONSTRAINT workforce_resources_resource_type_check
  CHECK (resource_type IN ('HUMAN', 'TEAM', 'POOL'));

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (4, '000004_workforce_resource_type_team');

COMMIT;
