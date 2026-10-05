-- WI-OI-120f (F0.5, ADR-0033 D1): Idempotency-Key results for the module SDK's record dispatcher, which serves
-- Inventory's metadata windows. A create or an action is claimed here first; a repeat with the same key returns the
-- stored answer, and a different request under the same key is refused. Forward-only; additive.
BEGIN;

CREATE TABLE gigalibs_inventory.record_idempotency (
  tenant_id varchar(64) NOT NULL,
  idempotency_key uuid NOT NULL,
  operation varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  state varchar(16) NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, idempotency_key),
  CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX record_idempotency_created ON gigalibs_inventory.record_idempotency (created_at);

ALTER TABLE gigalibs_inventory.record_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_inventory.record_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY record_idempotency_tenant_isolation ON gigalibs_inventory.record_idempotency
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (4, '000004_inventory_record_idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
