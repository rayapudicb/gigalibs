-- WI-OI-131 B7: definer function for cross-tenant position control totals (Analytics reconciliation).
BEGIN;

CREATE FUNCTION gigalibs_workforce.analytics_report_position_control_totals()
RETURNS TABLE(tenant_id text, record_count bigint, pending_outbox bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_workforce, pg_temp
AS $$
  SELECT COALESCE(p.tenant_id, o.tenant_id) AS tenant_id,
         COALESCE(p.record_count, 0)::bigint AS record_count,
         COALESCE(o.pending_outbox, 0)::bigint AS pending_outbox
    FROM (
      SELECT tenant_id, COUNT(*)::bigint AS record_count
        FROM gigalibs_workforce.outbox_events
       WHERE event_type IN (
         'WORKFORCE_POSITION_CREATED_V1',
         'WORKFORCE_POSITION_UPDATED_V1',
         'WORKFORCE_POSITION_SNAPSHOT_V1'
       )
         AND status IN ('PENDING', 'PUBLISHED')
       GROUP BY tenant_id
    ) p
    FULL OUTER JOIN (
      SELECT tenant_id, COUNT(*)::bigint AS pending_outbox
        FROM gigalibs_workforce.outbox_events
       WHERE event_type IN (
         'WORKFORCE_POSITION_CREATED_V1',
         'WORKFORCE_POSITION_UPDATED_V1',
         'WORKFORCE_POSITION_SNAPSHOT_V1'
       )
         AND status = 'PENDING'
       GROUP BY tenant_id
    ) o ON o.tenant_id = p.tenant_id;
$$;

REVOKE ALL ON FUNCTION gigalibs_workforce.analytics_report_position_control_totals() FROM PUBLIC;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (28, '000028_workforce_analytics_control_totals');

COMMIT;
