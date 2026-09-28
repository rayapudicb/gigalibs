-- Align the physical columns introduced by
-- 20260914000000_add_saga_governor_parenttenant with the canonical Prisma
-- datamodel. The preceding migration used snake_case column names while the
-- generated client expects the repository-wide camelCase convention.
--
-- These operations rename existing columns and metadata only; they do not
-- copy, coerce or discard row values.

ALTER TABLE "saga_instances" RENAME COLUMN "tenant_id" TO "tenantId";
ALTER TABLE "saga_instances" RENAME COLUMN "saga_type" TO "sagaType";
ALTER TABLE "saga_instances" RENAME COLUMN "compensation_triggered" TO "compensationTriggered";
ALTER TABLE "saga_instances" RENAME COLUMN "audit_ledger_digest" TO "auditLedgerDigest";
ALTER TABLE "saga_instances" RENAME COLUMN "log_summary" TO "logSummary";
ALTER TABLE "saga_instances" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "saga_instances" RENAME COLUMN "updated_at" TO "updatedAt";
ALTER TABLE "saga_instances" RENAME COLUMN "completed_at" TO "completedAt";

ALTER TABLE "saga_steps" RENAME COLUMN "saga_instance_id" TO "sagaInstanceId";
ALTER TABLE "saga_steps" RENAME COLUMN "step_index" TO "stepIndex";
ALTER TABLE "saga_steps" RENAME COLUMN "target_system" TO "targetSystem";
ALTER TABLE "saga_steps" RENAME COLUMN "forward_action" TO "forwardAction";
ALTER TABLE "saga_steps" RENAME COLUMN "compensating_action" TO "compensatingAction";
ALTER TABLE "saga_steps" RENAME COLUMN "fips_sha256_checksum" TO "fipsSha256Checksum";
ALTER TABLE "saga_steps" RENAME COLUMN "error_message" TO "errorMessage";
ALTER TABLE "saga_steps" RENAME COLUMN "executed_at" TO "executedAt";
ALTER TABLE "saga_steps" RENAME COLUMN "compensated_at" TO "compensatedAt";

ALTER TABLE "tenant_rate_buckets" RENAME COLUMN "tenant_id" TO "tenantId";
ALTER TABLE "tenant_rate_buckets" RENAME COLUMN "last_refill_timestamp_ms" TO "lastRefillTimestampMs";
ALTER TABLE "tenant_rate_buckets" RENAME COLUMN "updated_at" TO "updatedAt";

ALTER TABLE "tenants" RENAME COLUMN "parent_tenant_id" TO "parentTenantId";

ALTER TABLE "saga_instances"
    RENAME CONSTRAINT "saga_instances_tenant_id_fkey" TO "saga_instances_tenantId_fkey";
ALTER TABLE "saga_steps"
    RENAME CONSTRAINT "saga_steps_saga_instance_id_fkey" TO "saga_steps_sagaInstanceId_fkey";
ALTER TABLE "tenant_rate_buckets"
    RENAME CONSTRAINT "tenant_rate_buckets_tenant_id_fkey" TO "tenant_rate_buckets_tenantId_fkey";
ALTER TABLE "tenants"
    RENAME CONSTRAINT "tenants_parent_tenant_id_fkey" TO "tenants_parentTenantId_fkey";

ALTER INDEX "idx_saga_instances_tenant_status_created"
    RENAME TO "saga_instances_tenantId_status_createdAt_idx";
ALTER INDEX "idx_saga_steps_instance_step"
    RENAME TO "saga_steps_sagaInstanceId_stepIndex_idx";

-- The predecessor used a partial index that cannot be represented by the
-- canonical Prisma schema. Replace it with the declared tenant hierarchy index.
DROP INDEX "idx_tenants_parent_tenant_id";
CREATE INDEX "tenants_parentTenantId_idx" ON "tenants"("parentTenantId");
