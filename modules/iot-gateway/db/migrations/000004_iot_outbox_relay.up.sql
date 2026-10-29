-- WI-OI-130: outbox delivery state + CMMS relay lease/settle (SECURITY DEFINER).
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_iot_runtime') THEN
    CREATE ROLE gigalibs_iot_runtime LOGIN;
  END IF;
END
$$;

ALTER TABLE gigalibs_iot.outbox_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED')),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS causation_id text;

CREATE INDEX IF NOT EXISTS iot_outbox_delivery ON gigalibs_iot.outbox_events (status, available_at, created_at);

CREATE OR REPLACE FUNCTION gigalibs_iot.relay_lease_cmms_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_iot.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_iot, pg_temp
AS $$
  UPDATE gigalibs_iot.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE (o.tenant_id, o.id) IN (
     SELECT e.tenant_id, e.id FROM gigalibs_iot.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type IN ('IOT_METER_READING_V1', 'TELEMETRY_ALERT_V1')
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_iot.relay_settle_cmms_event(
  p_tenant_id text,
  p_id uuid,
  p_published boolean,
  p_error_code text,
  p_retry_seconds integer,
  p_max_attempts integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_iot, pg_temp
AS $$
  UPDATE gigalibs_iot.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE
                           WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                           ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900))
                         END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE tenant_id = p_tenant_id AND id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_iot.relay_lease_cmms_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_iot.relay_settle_cmms_event(text, uuid, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_iot.relay_lease_cmms_events(integer, integer) TO gigalibs_iot_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_iot.relay_settle_cmms_event(text, uuid, boolean, text, integer, integer) TO gigalibs_iot_runtime;

INSERT INTO gigalibs_iot.schema_migrations (version, name)
VALUES (4, '000004_iot_outbox_relay');

COMMIT;
