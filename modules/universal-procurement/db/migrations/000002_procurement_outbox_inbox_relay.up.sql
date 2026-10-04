-- WI-OI-113 (Slice C-1): Universal Procurement durable outbox-inbox relay and local receipt projections.
BEGIN;

-- 1. Outbox events table
CREATE TABLE gigalibs_procurement.outbox_events (
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

CREATE INDEX outbox_events_delivery ON gigalibs_procurement.outbox_events (status, available_at, created_at);

-- 2. Inbox receipts table (deduplication)
CREATE TABLE gigalibs_procurement.inbox_receipts (
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

CREATE INDEX inbox_receipts_tenant_consumer ON gigalibs_procurement.inbox_receipts (tenant_id, consumer_name);

-- 3. Local tenant projection of Inventory goods receipts (eliminates cross-schema SQL reads)
CREATE TABLE gigalibs_procurement.procurement_receipt_projections (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  receipt_id VARCHAR(64) NOT NULL,
  receipt_number VARCHAR(64) NOT NULL,
  receipt_line_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  received_quantity NUMERIC(18, 6) NOT NULL CHECK (received_quantity >= 0),
  uom_id VARCHAR(64) NOT NULL,
  purchase_order_id VARCHAR(64),
  purchase_order_line_id VARCHAR(64),
  warehouse_id VARCHAR(64) NOT NULL,
  matched_quantity NUMERIC(18, 6) NOT NULL DEFAULT 0.000000 CHECK (matched_quantity >= 0),
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_id, receipt_line_id)
);

CREATE INDEX receipt_projections_po_line ON gigalibs_procurement.procurement_receipt_projections (tenant_id, purchase_order_id, purchase_order_line_id);

-- 4. FIFO relay lease function
CREATE OR REPLACE FUNCTION gigalibs_procurement.relay_lease_procurement_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_procurement.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_procurement, pg_temp
AS $$
  UPDATE gigalibs_procurement.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_procurement.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

-- 5. Relay settle function
CREATE OR REPLACE FUNCTION gigalibs_procurement.relay_settle_procurement_event(
  p_id text, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_procurement, pg_temp
AS $$
  UPDATE gigalibs_procurement.outbox_events
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
  FOREACH rel IN ARRAY ARRAY['outbox_events', 'inbox_receipts', 'procurement_receipt_projections'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_procurement.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format('ALTER TABLE gigalibs_procurement.%I FORCE ROW LEVEL SECURITY', rel);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_procurement.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      rel || '_tenant_isolation',
      rel
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_procurement.schema_migrations (version, name)
VALUES (2, '000002_procurement_outbox_inbox_relay')
ON CONFLICT (version) DO NOTHING;

COMMIT;
