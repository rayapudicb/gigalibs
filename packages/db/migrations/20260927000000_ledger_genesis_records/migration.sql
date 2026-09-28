-- Phase 1 / US-P1-05: Ledger Genesis Record Per Tenant
-- Creates an immutable cryptographic genesis anchor that roots the double-entry Merkle audit chain.
CREATE TABLE IF NOT EXISTS "ledger_genesis_records" (
  "tenant_id" TEXT PRIMARY KEY,
  "genesis_hash" CHAR(64) NOT NULL CHECK ("genesis_hash" ~ '^[0-9a-f]{64}$'),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" TEXT NOT NULL,
  CONSTRAINT "ledger_genesis_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Backfill existing tenants with deterministic SHA-256 genesis hash
INSERT INTO "ledger_genesis_records" ("tenant_id", "genesis_hash", "created_at", "created_by")
SELECT
  t.id,
  encode(sha256(convert_to(t.id || ':' || coalesce(t."createdAt"::text, now()::text), 'utf8')), 'hex'),
  coalesce(t."createdAt", now()),
  'system:genesis_anchor'
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "ledger_genesis_records" g WHERE g.tenant_id = t.id
);
