-- WI-OI-120 (M-CUR, Phase 5A): workspace-scoped exchange rates — the real rates the FX engine converts with, replacing
-- the fabricated DEFAULT_FX_RATES. A rate is recorded with its effective moment and source; the live rate for a pair is
-- the newest asOf. Additive; independent of the older global currency_exchange_rates.

CREATE TABLE "tenant_exchange_rates" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL,
  "quoteCurrency" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "asOf" TIMESTAMPTZ(3) NOT NULL,
  "source" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_exchange_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_exchange_rates_rate_check" CHECK ("rate" > 0),
  CONSTRAINT "tenant_exchange_rates_pair_check" CHECK ("baseCurrency" <> "quoteCurrency"),
  CONSTRAINT "tenant_exchange_rates_ccy_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$' AND "quoteCurrency" ~ '^[A-Z]{3}$')
);

CREATE INDEX "tenant_exchange_rates_lookup_idx"
  ON "tenant_exchange_rates"("tenantId", "baseCurrency", "quoteCurrency", "asOf" DESC);

ALTER TABLE "tenant_exchange_rates"
  ADD CONSTRAINT "tenant_exchange_rates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
