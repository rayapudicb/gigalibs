-- WI-OI-128 S3: idempotent disposition recording by client request key.
BEGIN;

ALTER TABLE gigalibs_universal_returns.dispositions
  ADD COLUMN request_key uuid;

UPDATE gigalibs_universal_returns.dispositions SET request_key = id WHERE request_key IS NULL;

ALTER TABLE gigalibs_universal_returns.dispositions
  ALTER COLUMN request_key SET NOT NULL;

CREATE UNIQUE INDEX dispositions_tenant_request_key
  ON gigalibs_universal_returns.dispositions (tenant_id, request_key);

INSERT INTO gigalibs_universal_returns.schema_migrations (version, name)
VALUES (4, '000004_disposition_request_key')
ON CONFLICT (version) DO NOTHING;

COMMIT;
