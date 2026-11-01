-- WI-OI-131 B7: one bounded backfill of closed downtime rows into the Analytics outbox (relay delivers; no cross-schema read).
BEGIN;

INSERT INTO gigalibs_cmms.outbox_events
  (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload, status, available_at, created_at)
SELECT
  gen_random_uuid()::text,
  d.tenant_id,
  'cmms.downtime.v1',
  'DOWNTIME_ENDED_V1',
  'asset_downtime',
  d.id,
  2,
  'wi-oi-131-cmms-downtime-backfill',
  1,
  jsonb_build_object(
    'assetId', d.asset_id::text,
    'downtimeId', d.id::text,
    'startedAt', d.started_at::text,
    'endedAt', d.ended_at::text,
    'failureCauseCode', d.failure_cause_code
  ),
  'PENDING',
  now(),
  COALESCE(d.ended_at, d.started_at)
FROM gigalibs_cmms.asset_downtimes d
WHERE d.ended_at IS NOT NULL
ON CONFLICT (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING;

CREATE FUNCTION gigalibs_cmms.analytics_report_downtime_control_totals()
RETURNS TABLE(tenant_id text, record_count bigint, pending_outbox bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
  SELECT COALESCE(d.tenant_id, p.tenant_id) AS tenant_id,
         COALESCE(d.record_count, 0)::bigint AS record_count,
         COALESCE(p.pending_outbox, 0)::bigint AS pending_outbox
    FROM (
      SELECT tenant_id, COUNT(*)::bigint AS record_count
        FROM gigalibs_cmms.outbox_events
       WHERE topic = 'cmms.downtime.v1'
         AND event_type IN ('DOWNTIME_STARTED_V1', 'DOWNTIME_ENDED_V1')
         AND status IN ('PENDING', 'PUBLISHED')
       GROUP BY tenant_id
    ) d
    FULL OUTER JOIN (
      SELECT tenant_id, COUNT(*)::bigint AS pending_outbox
        FROM gigalibs_cmms.outbox_events
       WHERE topic = 'cmms.downtime.v1' AND status = 'PENDING'
       GROUP BY tenant_id
    ) p ON p.tenant_id = d.tenant_id;
$$;

REVOKE ALL ON FUNCTION gigalibs_cmms.analytics_report_downtime_control_totals() FROM PUBLIC;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (25, '000025_cmms_downtime_analytics_backfill');

COMMIT;
