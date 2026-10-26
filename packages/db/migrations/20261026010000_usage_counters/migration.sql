-- WI-OI-015 (T8b): cumulative usage counters per tenant, billing period (YYYY-MM) and meter. Metered work increments
-- a row in place; the billing hand-off reads a period's counters. Additive and independent of the rate-limiter's
-- tenant_rate_buckets.

CREATE TABLE "usage_counters" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "meterKey" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_counters_period_check" CHECK ("periodKey" ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT "usage_counters_quantity_check" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "usage_counters_tenantId_periodKey_meterKey_key"
  ON "usage_counters"("tenantId", "periodKey", "meterKey");
CREATE INDEX "usage_counters_tenantId_periodKey_idx"
  ON "usage_counters"("tenantId", "periodKey");

ALTER TABLE "usage_counters"
  ADD CONSTRAINT "usage_counters_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
