BEGIN;

-- 1. Add cryptographic seal columns to data_contracts
ALTER TABLE gigalibs_data_studio.data_contracts
  ADD COLUMN IF NOT EXISTS seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS previous_seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS seal_sequence BIGINT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_tenant_seal_sequence_idx
  ON gigalibs_data_studio.data_contracts (tenant_id, seal_sequence)
  WHERE seal_sequence IS NOT NULL;

-- 2. Create transactional inbox events table
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.inbox_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_data_studio_inbox UNIQUE (tenant_id, source, event_id)
);

ALTER TABLE gigalibs_data_studio.inbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_inbox ON gigalibs_data_studio.inbox_events;
CREATE POLICY tenant_isolation_inbox ON gigalibs_data_studio.inbox_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 3. Record schema migration
INSERT INTO gigalibs_data_studio.schema_migrations (version, name, applied_at)
VALUES (3, '000003_data_studio_ledger_seals_and_inbox', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
