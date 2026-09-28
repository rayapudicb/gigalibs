-- Forward additive migration for TP-5: Transactional Audit Conformance & Checkpoints
-- Establishes tenant_audit_chains for transaction-safe sequence locking and gapless hash chain verification

CREATE TABLE IF NOT EXISTS "tenant_audit_chains" (
  "id" VARCHAR(64) PRIMARY KEY,
  "tenantId" VARCHAR(30) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "chainScope" VARCHAR(64) NOT NULL DEFAULT 'default',
  "lastSequence" BIGINT NOT NULL DEFAULT 0,
  "headHash" VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  "sealedCount" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_audit_chains_tenant_scope_key"
  ON "tenant_audit_chains"("tenantId", "chainScope");

CREATE INDEX IF NOT EXISTS "tenant_audit_chains_tenant_idx"
  ON "tenant_audit_chains"("tenantId");

ALTER TABLE "tenant_audit_chains" ENABLE ROW LEVEL SECURITY;
