# WI-OI-015 / T8b — Metering, quotas and billing hand-off

- **Status:** Core built 2026-10-26 (local). Plan item 3.7. Independent review (Finance + Security) before deploy.

## What existed

A **rate-limiter** governor (`governor.service.ts`, `governor-persistent.service.ts`, `tenant_rate_buckets`): a
per-tenant token bucket enforcing requests-per-minute and burst by tier, exposed at `@Public` `governor/*`. That is
rate limiting, not billing — there was no cumulative usage ledger and no billing hand-off.

## What T8b adds — metered usage, plan quotas, billing hand-off

Cumulative usage is now metered per tenant, billing period and meter, and a period reconciles into invoice line-items
against a plan's quotas (included allowance free, overage billed).

- **Schema + migration `20261026010000_usage_counters`:** `usage_counters` (tenant, `periodKey` YYYY-MM, `meterKey`,
  `quantity` BIGINT; unique on tenant+period+meter; CHECKs on period format and non-negative quantity; tenant FK
  CASCADE). Additive and independent of `tenant_rate_buckets`. Generated client rebuilt at build, not committed.
- **Contracts** (`metering/usage-metering.ts`): `MeterKey` (API_REQUESTS, WORKFLOW_RUNS, AI_TOKENS, STORAGE_BYTES),
  `MeteredPlan` (STARTER, GROWTH, ENTERPRISE), `PLAN_METER_QUOTAS` (included + overage rate per meter; ENTERPRISE
  unlimited), and pure helpers `billingPeriodKey`, `isBillingPeriodKey`, `usageThresholdBand` (80/90/100),
  `meterUsageDetail`, `buildUsageStatement` (the hand-off — reuses the billing module's `InvoiceLineItem`; a line is
  emitted only for billable overage, amount rounded up). Plan figures are placeholders a finance owner tunes; the math
  is what is tested.
- **Service** (`usage-metering.service.ts`): `record(tenantId, meter, quantity, at?)` — an in-process meter call that
  atomically upserts/increments the period's counter (no public write surface); `periodUsage`; `statement` (the
  reconciled hand-off).
- **Endpoints** (`usage.controller.ts`, gated `billing:read` — workspace admins hold `billing:*`): `GET usage` and
  `GET usage/statement?plan=&period=` (period defaults to the current one). `billing:read` registered in
  `CONTROL_PLANE_PERMISSIONS`; `UsageCounter` classified in `config/package-layers.json` (audit:layers clean).

## Proof

- Pure logic + schemas: `metering/usage-metering.test.ts` (8 — period keys, threshold bands, overage rounding,
  statement totals, ENTERPRISE unlimited, record validation).
- Service (atomic increment, truncation, no-op, read-back, statement), mocked Prisma: `usage-metering.service.spec.ts`
  (5). Contracts + playground-api typecheck green; new files lint clean.

## Deferred (flagged)

- **Hot-path metering integration** — calling `record` from the request/run/token/storage paths (needs a decision on
  where each meter is incremented, and a Redis counter in front of Postgres for throughput per the WI-OI-015 scope).
- **Hard-cap enforcement** (429 on exceeding a hard quota) — the governor does per-minute limiting; a monthly hard cap
  on a metered dimension would read `periodUsage` against the plan.
- **Stripe sync + scheduled monthly invoice job + threshold alert delivery** (80/90/100%) — `usageThresholdBand` and
  the statement are the inputs; delivery/sync need external services.
- **Web metering screen** wiring (an `admin/metering` page exists against the governor; a usage/billing view would
  consume `usage/statement`).
