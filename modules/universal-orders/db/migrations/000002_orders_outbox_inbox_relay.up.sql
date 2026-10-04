-- WI-OI-113 (Slice C-1): Universal Orders durable outbox-inbox relay and external AR invoice reference projection.
BEGIN;

-- 1. Outbox events table
CREATE TABLE gigalibs_orders.outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  topic VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(128) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  causation_id VARCHAR(128),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);

CREATE INDEX outbox_events_delivery ON gigalibs_orders.outbox_events (status, available_at, created_at);

-- 2. Inbox receipts table (deduplication)
CREATE TABLE gigalibs_orders.inbox_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  consumer_name VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source_module VARCHAR(64) NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  processed_at TIMESTAMPTZ,
  last_error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, consumer_name, message_id)
);

CREATE INDEX inbox_receipts_tenant_consumer ON gigalibs_orders.inbox_receipts (tenant_id, consumer_name);

-- 3. External AR Invoice reference projection (per ADR-0026: AR owns canonical invoices; Orders holds projection)
CREATE TABLE gigalibs_orders.order_ar_invoice_projections (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  ar_invoice_id VARCHAR(64) NOT NULL,
  ar_invoice_number VARCHAR(64) NOT NULL,
  total_amount_minor VARCHAR(64) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
  seal_hash VARCHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, fulfillment_id)
);

CREATE INDEX ar_projections_order ON gigalibs_orders.order_ar_invoice_projections (tenant_id, order_id);

-- 4. FIFO relay lease function
CREATE OR REPLACE FUNCTION gigalibs_orders.relay_lease_orders_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_orders.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_orders, pg_temp
AS $$
  UPDATE gigalibs_orders.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_orders.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

-- 5. Relay settle function
CREATE OR REPLACE FUNCTION gigalibs_orders.relay_settle_orders_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_orders, pg_temp
AS $$
  UPDATE gigalibs_orders.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id
$$;

-- 6. Row-Level Security
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['outbox_events', 'inbox_receipts', 'order_ar_invoice_projections'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_orders.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format('ALTER TABLE gigalibs_orders.%I FORCE ROW LEVEL SECURITY', rel);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_orders.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      rel || '_tenant_isolation',
      rel
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_orders.schema_migrations (version)
VALUES (2)
ON CONFLICT (version) DO NOTHING;

COMMIT;
