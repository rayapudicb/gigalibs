-- WI-OI-105e (ADR-0007, ADR-0016 F15): a connection can also send its pulled records to Geospatial as places. The
-- connection names which record fields hold the place's name, geometry, code and parent; each newly journalled record
-- then writes a CONNECTOR_PLACE_PULLED_V1 fact in the same transaction, and a second relay delivers it to Geospatial's
-- inbox with its own relay key. The definer functions below are that relay's only cross-tenant access. Forward-only;
-- additive.

BEGIN;

ALTER TABLE gigalibs_connectors.tenant_connections
    ADD COLUMN IF NOT EXISTS place_delivery JSONB CHECK (place_delivery IS NULL OR jsonb_typeof(place_delivery) = 'object');

-- Leases due place facts, at most the oldest pending one per record, so versions of one record arrive in order.
CREATE FUNCTION gigalibs_connectors.relay_lease_geospatial_places(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_connectors.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
  UPDATE gigalibs_connectors.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_connectors.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.event_type = 'CONNECTOR_PLACE_PULLED_V1'
        AND NOT EXISTS (
          SELECT 1 FROM gigalibs_connectors.outbox_events p
           WHERE p.status = 'PENDING'
             AND p.event_type = 'CONNECTOR_PLACE_PULLED_V1'
             AND p.tenant_id = e.tenant_id
             AND p.aggregate_id = e.aggregate_id
             AND (p.created_at, p.id) < (e.created_at, e.id))
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_connectors.relay_settle_geospatial_place(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
  UPDATE gigalibs_connectors.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING' AND event_type = 'CONNECTOR_PLACE_PULLED_V1'
$$;

REVOKE ALL ON FUNCTION gigalibs_connectors.relay_lease_geospatial_places(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_connectors.relay_settle_geospatial_place(text, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (8, '000008_geospatial_places_relay', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
