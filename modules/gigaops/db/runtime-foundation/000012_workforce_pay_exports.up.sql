-- WI-OI-071 (roadmap P8): canonical payroll exports of approved pay runs, with reconciliation. Forward-only.
-- One export per run and format; the file content and its digest never change after creation (trigger), and an
-- export is acknowledged only with the target's matching control totals.
BEGIN;

CREATE TABLE gigalibs_workforce.pay_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  run_id UUID NOT NULL,
  format VARCHAR(32) NOT NULL CHECK (format IN ('PAYROLL_CSV_V1')),
  status VARCHAR(16) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'ACKNOWLEDGED')),
  content TEXT NOT NULL CHECK (octet_length(content) <= 16777216),
  file_sha256 CHAR(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  line_count INTEGER NOT NULL CHECK (line_count >= 0),
  totals JSONB NOT NULL CHECK (jsonb_typeof(totals) = 'array'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_reference VARCHAR(128),
  reported JSONB,
  acknowledged_by VARCHAR(128),
  acknowledged_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id VARCHAR(128) NOT NULL,
  CHECK ((status = 'ACKNOWLEDGED') = (target_reference IS NOT NULL AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)),
  CHECK (acknowledged_by IS NULL OR acknowledged_by <> created_by),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, run_id, format),
  FOREIGN KEY (tenant_id, run_id) REFERENCES gigalibs_workforce.pay_runs (tenant_id, id)
);

CREATE FUNCTION gigalibs_workforce.refuse_pay_export_rewrite() RETURNS trigger
LANGUAGE plpgsql
SET search_path = gigalibs_workforce, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pay exports are kept' USING ERRCODE = '55000';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
     OR NEW.line_count IS DISTINCT FROM OLD.line_count OR NEW.totals IS DISTINCT FROM OLD.totals
     OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.format IS DISTINCT FROM OLD.format
     OR OLD.status = 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'pay export % is immutable', OLD.id USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pay_exports_immutable
  BEFORE UPDATE OR DELETE ON gigalibs_workforce.pay_exports
  FOR EACH ROW EXECUTE FUNCTION gigalibs_workforce.refuse_pay_export_rewrite();

ALTER TABLE gigalibs_workforce.pay_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.pay_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY pay_exports_tenant_isolation ON gigalibs_workforce.pay_exports FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (12, '000012_workforce_pay_exports');

COMMIT;
