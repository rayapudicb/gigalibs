-- WI-OI-113 (Slice C-1): Universal Inventory outbox upgrade, inbox receipts, and PO references on receipt lines.
BEGIN;

-- 1. Upgrade outbox_events to Delta-5 Relay standard
ALTER TABLE gigalibs_inventory.outbox_events
  ADD COLUMN IF NOT EXISTS topic VARCHAR(128) NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS aggregate_type VARCHAR(128) NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS aggregate_id VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aggregate_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS causation_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(128);

ALTER TABLE gigalibs_inventory.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE gigalibs_inventory.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED'));

CREATE INDEX IF NOT EXISTS outbox_events_delivery_idx ON gigalibs_inventory.outbox_events (status, available_at, created_at);

-- 2. Inbox receipts table (deduplication)
CREATE TABLE IF NOT EXISTS gigalibs_inventory.inbox_receipts (
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

CREATE INDEX IF NOT EXISTS inbox_receipts_tenant_consumer ON gigalibs_inventory.inbox_receipts (tenant_id, consumer_name);

-- 3. Add PO / PO line references to receipt lines for clean 3-way match emission
ALTER TABLE gigalibs_inventory.receipt_lines
  ADD COLUMN IF NOT EXISTS purchase_order_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS purchase_order_line_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS receipt_lines_po_idx ON gigalibs_inventory.receipt_lines (tenant_id, purchase_order_id, purchase_order_line_id);

-- 4. FIFO relay lease function
CREATE OR REPLACE FUNCTION gigalibs_inventory.relay_lease_inventory_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_inventory.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_inventory, pg_temp
AS $$
  UPDATE gigalibs_inventory.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_inventory.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

-- 5. Relay settle function
CREATE OR REPLACE FUNCTION gigalibs_inventory.relay_settle_inventory_event(
  p_id uuid, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_inventory, pg_temp
AS $$
  UPDATE gigalibs_inventory.outbox_events
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

-- 6. Row-Level Security on inbox_receipts
ALTER TABLE gigalibs_inventory.inbox_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.inbox_receipts FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'gigalibs_inventory' AND tablename = 'inbox_receipts' AND policyname = 'inbox_receipts_tenant_isolation'
  ) THEN
    CREATE POLICY inbox_receipts_tenant_isolation ON gigalibs_inventory.inbox_receipts
      FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
  END IF;
END $$;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (2, '000002_inventory_outbox_inbox_relay')
ON CONFLICT (version) DO NOTHING;

COMMIT;
