-- WI-OI-120ha (M-AR0 F0): Idempotency-Key results for the module SDK record dispatcher (metadata windows).
BEGIN;

CREATE TABLE gigalibs_ar.record_idempotency (
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
CREATE INDEX record_idempotency_created ON gigalibs_ar.record_idempotency (created_at);

ALTER TABLE gigalibs_ar.record_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.record_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY record_idempotency_tenant_isolation ON gigalibs_ar.record_idempotency
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (16, '000016_ar_record_idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
