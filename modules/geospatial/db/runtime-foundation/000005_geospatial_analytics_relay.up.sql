BEGIN;

-- WI-OI-105b (ADR-0007, ADR-0016 F15): place facts reach Analytics' place directory through the module SDK's outbox
-- relay. The definer functions below are the relay's only cross-tenant access. Place facts never had a consumer, so
-- 12k+ waited unrouted: each place's latest fact is brought up to its current state (name, point, boundary, area)
-- and older queued versions of the same place are closed as superseded. No place data changes.

CREATE INDEX outbox_events_place_pending
  ON gigalibs_geospatial.outbox_events (tenant_id, aggregate_id, aggregate_version)
  WHERE status = 'PENDING' AND event_type = 'SpatialNodeChangedV1';
CREATE INDEX outbox_events_sweep ON gigalibs_geospatial.outbox_events (status, created_at);

-- Leases due place facts, at most the lowest pending version per place, so a place's versions arrive in order.
CREATE FUNCTION gigalibs_geospatial.relay_lease_analytics_places(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_geospatial.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_geospatial, pg_temp
AS $$
  UPDATE gigalibs_geospatial.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_geospatial.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now() AND e.event_type = 'SpatialNodeChangedV1'
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_geospatial.outbox_events p
           WHERE p.status = 'PENDING' AND p.event_type = 'SpatialNodeChangedV1'
             AND p.tenant_id = e.tenant_id AND p.aggregate_id = e.aggregate_id
             AND p.aggregate_version < e.aggregate_version)
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_geospatial.relay_settle_analytics_place(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_geospatial, pg_temp
AS $$
  UPDATE gigalibs_geospatial.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING' AND event_type = 'SpatialNodeChangedV1'
$$;

-- Deletes delivered facts, and facts no consumer is routed for (node types), after the retention window; old inbox
-- receipts after theirs. Pending place facts and dead letters stay.
CREATE FUNCTION gigalibs_geospatial.outbox_sweep(p_retention_days integer, p_receipt_retention_days integer, p_limit integer)
RETURNS TABLE (published bigint, unrouted bigint, receipts bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_geospatial, pg_temp
AS $$
DECLARE
  retention interval := make_interval(days => GREATEST(p_retention_days, 7));
  receipt_retention interval := make_interval(days => GREATEST(p_receipt_retention_days, p_retention_days, 7) + 1);
  batch integer := GREATEST(LEAST(p_limit, 50000), 1);
BEGIN
  WITH doomed AS (
    SELECT id FROM gigalibs_geospatial.outbox_events WHERE status = 'PUBLISHED' AND created_at < now() - retention LIMIT batch)
  DELETE FROM gigalibs_geospatial.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS published = ROW_COUNT;
  WITH doomed AS (
    SELECT id FROM gigalibs_geospatial.outbox_events
     WHERE status = 'PENDING' AND event_type <> 'SpatialNodeChangedV1' AND created_at < now() - retention LIMIT batch)
  DELETE FROM gigalibs_geospatial.outbox_events o USING doomed WHERE o.id = doomed.id;
  GET DIAGNOSTICS unrouted = ROW_COUNT;
  WITH doomed AS (
    SELECT id FROM gigalibs_geospatial.inbox_receipts WHERE received_at < now() - receipt_retention LIMIT batch)
  DELETE FROM gigalibs_geospatial.inbox_receipts r USING doomed WHERE r.id = doomed.id;
  GET DIAGNOSTICS receipts = ROW_COUNT;
  RETURN NEXT;
END
$$;

-- Each place's current state as a fact (also used by the republish command, per tenant).
CREATE FUNCTION gigalibs_geospatial.place_fact_payload(n gigalibs_geospatial.spatial_nodes, node_type_code text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'nodeId', n.id, 'change', 'UPDATED', 'path', n.path::text, 'previousPath', NULL, 'parentId', n.parent_id,
    'nodeTypeCode', node_type_code, 'countryCode', n.country_code, 'subdivisionCode', n.subdivision_code,
    'timeZone', n.time_zone, 'status', n.status, 'aggregateVersion', n.version, 'displayName', n.display_name,
    'latitude', n.latitude::double precision, 'longitude', n.longitude::double precision,
    'boundary', n.boundary, 'areaM2', n.area_m2::double precision)
$$;

INSERT INTO gigalibs_geospatial.outbox_events
  (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
SELECT gen_random_uuid()::text, n.tenant_id, 'geospatial.facts.v1', 'SpatialNodeChangedV1', 'SPATIAL_NODE', n.id::text,
       n.version, 'wi-oi-105b-backfill', 1, gigalibs_geospatial.place_fact_payload(n, t.code)
  FROM gigalibs_geospatial.spatial_nodes n
  JOIN gigalibs_geospatial.spatial_node_types t ON t.tenant_id = n.tenant_id AND t.id = n.node_type_id
ON CONFLICT (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
DO UPDATE SET payload = EXCLUDED.payload, status = 'PENDING', available_at = now(), attempt_count = 0;

UPDATE gigalibs_geospatial.outbox_events o
   SET status = 'PUBLISHED', published_at = now(), last_error_code = 'SUPERSEDED_BY_BACKFILL'
  FROM gigalibs_geospatial.spatial_nodes n
 WHERE o.event_type = 'SpatialNodeChangedV1' AND o.status = 'PENDING'
   AND n.tenant_id = o.tenant_id AND n.id::text = o.aggregate_id AND o.aggregate_version < n.version;

REVOKE ALL ON FUNCTION gigalibs_geospatial.relay_lease_analytics_places(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_geospatial.relay_settle_analytics_place(text, boolean, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_geospatial.outbox_sweep(integer, integer, integer) FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gigalibs_geospatial REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (5, '000005_geospatial_analytics_relay');

COMMIT;
