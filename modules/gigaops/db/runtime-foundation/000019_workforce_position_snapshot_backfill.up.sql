-- WI-OI-109 live forward fix: migration 000018 made historical position audit facts eligible for Analytics, but
-- facts written before WI-OI-109 do not contain the complete organization-aware snapshot contract. Preserve those
-- rejected rows as immutable delivery evidence and publish one current, versioned snapshot per existing position.
-- New commands continue to publish complete CREATED/UPDATED facts; SNAPSHOT is reserved for this convergence backfill.
BEGIN;

DROP INDEX gigalibs_workforce.outbox_events_analytics_position_pending;
CREATE INDEX outbox_events_analytics_position_pending
  ON gigalibs_workforce.outbox_events (tenant_id, aggregate_id, aggregate_version)
  WHERE status = 'PENDING'
    AND event_type IN (
      'WORKFORCE_POSITION_CREATED_V1',
      'WORKFORCE_POSITION_UPDATED_V1',
      'WORKFORCE_POSITION_SNAPSHOT_V1'
    );

CREATE OR REPLACE FUNCTION gigalibs_workforce.relay_lease_analytics_positions(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_workforce.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
  UPDATE gigalibs_workforce.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_workforce.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.event_type IN (
          'WORKFORCE_POSITION_CREATED_V1',
          'WORKFORCE_POSITION_UPDATED_V1',
          'WORKFORCE_POSITION_SNAPSHOT_V1'
        )
        -- Fail closed: only the complete V1 snapshot shape may leave Workforce.
        AND e.payload ?& ARRAY[
          'entityId', 'aggregateVersion', 'code', 'jobProfileId', 'siteRef', 'organizationUnitId',
          'tenantShared', 'fte', 'effectiveFrom', 'effectiveTo', 'status'
        ]
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_workforce.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.event_type IN (
               'WORKFORCE_POSITION_CREATED_V1',
               'WORKFORCE_POSITION_UPDATED_V1',
               'WORKFORCE_POSITION_SNAPSHOT_V1'
             )
             AND p.payload ?& ARRAY[
               'entityId', 'aggregateVersion', 'code', 'jobProfileId', 'siteRef', 'organizationUnitId',
               'tenantShared', 'fte', 'effectiveFrom', 'effectiveTo', 'status'
             ]
             AND p.tenant_id = e.tenant_id AND p.aggregate_id = e.aggregate_id
             AND p.aggregate_version < e.aggregate_version)
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_workforce.relay_settle_analytics_position(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
  UPDATE gigalibs_workforce.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING'
     AND event_type IN (
       'WORKFORCE_POSITION_CREATED_V1',
       'WORKFORCE_POSITION_UPDATED_V1',
       'WORKFORCE_POSITION_SNAPSHOT_V1'
     )
$$;

INSERT INTO gigalibs_workforce.outbox_events
  (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id,
   schema_version, payload, status, available_at, created_at)
SELECT
  gen_random_uuid()::text,
  p.tenant_id,
  'workforce.facts.v1',
  'WORKFORCE_POSITION_SNAPSHOT_V1',
  'WORKFORCE_POSITION',
  p.id,
  p.version,
  'wi-oi-109-position-snapshot-backfill',
  1,
  jsonb_build_object(
    'entityId', p.id,
    'aggregateVersion', p.version,
    'code', p.code,
    'jobProfileId', p.job_profile_id,
    'siteRef', p.site_ref,
    'organizationUnitId', p.department_id,
    'tenantShared', p.department_id IS NULL,
    'fte', p.fte,
    'effectiveFrom', p.effective_from::text,
    'effectiveTo', CASE WHEN p.effective_to IS NULL THEN NULL ELSE to_jsonb(p.effective_to::text) END,
    'status', p.status
  ),
  'PENDING',
  now(),
  now()
FROM gigalibs_workforce.positions p
ON CONFLICT (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING;

REVOKE ALL ON FUNCTION gigalibs_workforce.relay_lease_analytics_positions(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_workforce.relay_settle_analytics_position(text, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (19, '000019_workforce_position_snapshot_backfill');

COMMIT;
