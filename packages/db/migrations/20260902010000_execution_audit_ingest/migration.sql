ALTER TABLE "audit_logs" ADD COLUMN "sourceEventId" TEXT;

CREATE UNIQUE INDEX "audit_logs_sourceEventId_key" ON "audit_logs"("sourceEventId");

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_tenantId_fkey";
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
