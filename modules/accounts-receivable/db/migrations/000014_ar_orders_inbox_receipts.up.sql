-- WI-OI-113: Accounts Receivable inbox receipts for commercial-operational handshakes
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_ar.inbox_receipts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id UUID NOT NULL,
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
  CONSTRAINT inbox_receipts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS inbox_receipts_tenant_consumer ON gigalibs_ar.inbox_receipts (tenant_id, consumer_name);

ALTER TABLE gigalibs_ar.inbox_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.inbox_receipts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'gigalibs_ar' AND tablename = 'inbox_receipts' AND policyname = 'inbox_receipts_tenant_isolation'
  ) THEN
    CREATE POLICY inbox_receipts_tenant_isolation ON gigalibs_ar.inbox_receipts
      FOR ALL
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (14, '000014_ar_orders_inbox_receipts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
