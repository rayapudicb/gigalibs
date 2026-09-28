-- WI-OI-068 (ADR-0007 option A): CMMS side of the Workforce work handshake. Forward-only.
-- CMMS asks Workforce to staff a work order and keeps a projection of the resulting bookings. It never stores
-- worker master data: only the Workforce booking and resource ids, a display name and the booking window/state.
BEGIN;

CREATE TABLE gigalibs_cmms.inbox_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source_module VARCHAR(128) NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  UNIQUE (tenant_id, consumer_name, message_id)
);
CREATE INDEX inbox_receipts_processing ON gigalibs_cmms.inbox_receipts (tenant_id, status, received_at);

CREATE TABLE gigalibs_cmms.work_order_staffing (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL,
  request_key     uuid NOT NULL,
  requirement_ref uuid,
  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  headcount       integer NOT NULL CHECK (headcount BETWEEN 1 AND 50),
  capability_codes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capability_codes) = 'array' AND jsonb_array_length(capability_codes) <= 20),
  rejection_reason text CHECK (char_length(rejection_reason) <= 500),
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by      gigalibs_cmms.principal_ref NOT NULL,
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_order_staffing_request_key_unique UNIQUE (tenant_id, request_key),
  CONSTRAINT work_order_staffing_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at),
  CHECK ((status = 'REJECTED') = (rejection_reason IS NOT NULL))
);
-- One live staffing request per work order.
CREATE UNIQUE INDEX work_order_staffing_one_live
  ON gigalibs_cmms.work_order_staffing (tenant_id, work_order_id) WHERE status IN ('REQUESTED', 'ACCEPTED');

CREATE TABLE gigalibs_cmms.work_order_bookings (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  booking_ref     uuid NOT NULL,
  work_order_id   uuid NOT NULL,
  requirement_ref uuid NOT NULL,
  resource_ref    uuid NOT NULL,
  resource_name   text CHECK (char_length(resource_name) <= 200),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'ON_SITE', 'COMPLETED', 'CANCELLED')),
  source_version  integer NOT NULL CHECK (source_version > 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, booking_ref),
  CONSTRAINT work_order_bookings_wo_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX work_order_bookings_by_wo ON gigalibs_cmms.work_order_bookings (tenant_id, work_order_id);

ALTER TABLE gigalibs_cmms.work_order_events DROP CONSTRAINT work_order_events_event_type_check;
ALTER TABLE gigalibs_cmms.work_order_events ADD CONSTRAINT work_order_events_event_type_check CHECK (event_type IN (
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'TASK_RECORDED', 'LABOUR_LOGGED', 'PART_ISSUED', 'NOTE_ADDED',
  'STAFFING_REQUESTED', 'STAFFING_UPDATED'));

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['inbox_receipts', 'work_order_staffing', 'work_order_bookings'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

-- Relay leasing for the handshake event types only (see the Workforce 000008 counterpart).
CREATE FUNCTION gigalibs_cmms.relay_lease_workforce_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_cmms.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
  UPDATE gigalibs_cmms.outbox_events o
     SET available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_cmms.outbox_events e
      WHERE e.status = 'PENDING' AND e.available_at <= now()
        AND e.event_type IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1')
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_cmms.relay_settle_workforce_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_cmms, pg_temp
AS $$
  UPDATE gigalibs_cmms.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id AND status = 'PENDING' AND event_type IN ('CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1')
$$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (11, '000011_cmms_workforce_handshake');

COMMIT;
