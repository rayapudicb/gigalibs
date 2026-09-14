-- Migration: add_saga_governor_parenttenant
-- Phase 3: Durable Saga State Machine (replaces in-memory sagaOrchestratorStore)
-- Phase 4: Durable Governor Rate Buckets (replaces in-memory Map<tenantId, BucketState>)
-- Phase 5: Multi-Org hierarchy parentTenantId on Tenant

-- ─── Phase 3: Saga tables ───────────────────────────────────────────────────

CREATE TABLE "saga_instances" (
    "id"                      TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL,
    "saga_type"               TEXT NOT NULL,
    "status"                  TEXT NOT NULL DEFAULT 'STARTED',
    "payload"                 JSONB NOT NULL,
    "compensation_triggered"  BOOLEAN NOT NULL DEFAULT false,
    "audit_ledger_digest"     TEXT,
    "log_summary"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"            TIMESTAMPTZ(3),

    CONSTRAINT "saga_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saga_steps" (
    "id"                    TEXT NOT NULL,
    "saga_instance_id"      TEXT NOT NULL,
    "step_index"            INTEGER NOT NULL,
    "name"                  TEXT NOT NULL,
    "target_system"         TEXT NOT NULL,
    "forward_action"        TEXT NOT NULL,
    "compensating_action"   TEXT NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'PENDING',
    "fips_sha256_checksum"  TEXT,
    "error_message"         TEXT,
    "executed_at"           TIMESTAMPTZ(3),
    "compensated_at"        TIMESTAMPTZ(3),

    CONSTRAINT "saga_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_saga_instances_tenant_status_created"
    ON "saga_instances"("tenant_id", "status", "created_at" DESC);

CREATE INDEX "idx_saga_steps_instance_step"
    ON "saga_steps"("saga_instance_id", "step_index");

ALTER TABLE "saga_instances"
    ADD CONSTRAINT "saga_instances_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "saga_steps"
    ADD CONSTRAINT "saga_steps_saga_instance_id_fkey"
    FOREIGN KEY ("saga_instance_id") REFERENCES "saga_instances"("id") ON DELETE CASCADE;

-- ─── Phase 4: Governor token buckets ────────────────────────────────────────

CREATE TABLE "tenant_rate_buckets" (
    "tenant_id"                 TEXT NOT NULL,
    "tier"                      TEXT NOT NULL DEFAULT 'STANDARD',
    "tokens"                    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_refill_timestamp_ms"  BIGINT NOT NULL,
    "updated_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_rate_buckets_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "tenant_rate_buckets"
    ADD CONSTRAINT "tenant_rate_buckets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

-- ─── Phase 5: Multi-org hierarchy ───────────────────────────────────────────

ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "parent_tenant_id" TEXT;

ALTER TABLE "tenants"
    ADD CONSTRAINT "tenants_parent_tenant_id_fkey"
    FOREIGN KEY ("parent_tenant_id") REFERENCES "tenants"("id");

CREATE INDEX "idx_tenants_parent_tenant_id"
    ON "tenants"("parent_tenant_id")
    WHERE "parent_tenant_id" IS NOT NULL;
