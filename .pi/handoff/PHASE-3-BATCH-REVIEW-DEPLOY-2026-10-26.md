# Phase 3 batch — review & deploy brief (2026-10-26)

**For:** the independent reviewer (Security for the access/persona work; Finance + Security for metering/billing) and
the owner/deployer. **Branch:** `feat/gigaops-convergence-core`. Not yet deployed.

Completes the remaining buildable Phase 3 plan items, in the owner-approved order **R16 → S17 → T9b → T8b**. Each is a
self-contained use case with its own commit; detail is on the task cards.

## Commits (range `2506b37a` … `f8e0d7ad`)

| Commit | Item | Card |
| --- | --- | --- |
| `2506b37a` | **R16** Personas from roles — capability-aware `determinePersona` | `.pi/tasks/WI-OI-120p.md` |
| `51d8a9d3` | **S17** People administration console (bulk invite, tracker, grant, off-board) | `.pi/tasks/WI-OI-120p.md` |
| `a630bae0` | **T9b** Retention classes + purge wiring | `.pi/tasks/T9b-retention-classes.md` |
| `f8e0d7ad` | **T8b** Usage metering, plan quotas, billing hand-off | `.pi/tasks/WI-OI-015-T8b.md` |

## Review focus

- **R16 (Security):** persona is now derived from a member's permissions as well as their role names (so a custom role
  is no longer forced to CUSTOMER_GUEST). Confirm the key safety property: persona is a **navigation lens only**
  (`personaSeesModule` is its sole consumer, verified repo-wide), the permission signal **caps at TENANT_ADMIN**, and
  PLATFORM_OPERATOR/C_LEVEL stay identity-only — so a tenant cannot widen access by granting permissions, only the
  sidebar. No authorisation decision reads persona.
- **S17 (Security):** the new console only calls the existing R13/R14 delegated endpoints through the catch-all proxy;
  all authority checks stay server-side (the UI is gated by `people:manage`/`people:read`/`users:update` for display
  only). No new control-plane authority.
- **T9b (Security):** retention classes change *how long* data is kept; a legal hold still overrides any class. The
  purge still refuses to run under an ACTIVE hold.
- **T8b (Finance + Security):** confirm the billing math in `buildUsageStatement` (free allowance, overage rounded up,
  statement totals) and that the placeholder `PLAN_METER_QUOTAS` figures are replaced with real numbers before any
  customer billing. `usage/*` is read-only and `billing:read`-gated; usage is recorded in-process, not via a public
  write.

## Migrations (control-plane, additive)

Two new, additive migrations in `packages/db/migrations/` — run both on deploy:
- `20261026000000_retention_classes` — `RetentionBasis` enum + `retention_classes` table + nullable
  `tenant_environments.retentionClassId` FK (SET NULL). Partial unique index: one live default class per tenant.
- `20261026010000_usage_counters` — `usage_counters` table (unique per tenant+period+meter).

Both are new-table/new-nullable-column only; nothing backfills, and pre-existing rows are unaffected. The generated
Prisma client is rebuilt at image build (not committed), so a control-plane rebuild picks the new models up.

## New control-plane permission

`billing:read` added to `CONTROL_PLANE_PERMISSIONS` (workspace administrators already hold `billing:*`). New models
`RetentionClass` and `UsageCounter` classified in `config/package-layers.json` (`audit:layers` clean).

## Deploy notes

- **Rebuild:** the control-plane API (`playground-api` — T9b/T8b services, endpoints, worker) and the web shell
  (`workflow-platform` — R16 persona + the S17 console). R16 also changes `@gigalibs/contracts` and `@gigalibs/auth-core`.
- **Run** the two migrations above against the control-plane database.
- Modules (CMMS, ERP, etc.) are **not** changed by this batch.

## Verification evidence (local)

- Typecheck: `@gigalibs/contracts`, `@gigalibs/auth-core`, `@gigalibs/workflow-platform`, `@gigalibs/app-playground-api`
  all green.
- Unit tests: contracts full suite 386 pass (incl. new `persona-from-roles` 10, `retention-class` 7,
  `usage-metering` 8); web `persona-routing`/`executive-control-tower`/`people-admin-parse`/`people-administration`
  green; playground-api `retention-class.service` 5, `usage-metering.service` 5.
- `audit:layers` clean; new files lint clean (pre-existing biome debt in edited files untouched).
- DB integration tests for the two new services are **deferred** (mocked-Prisma specs cover the control flow; a real-DB
  test would also exercise the partial-unique-index default invariant and the atomic increment end to end).

## Deferred follow-ups (flagged on the cards)

- **R16:** none material.
- **S17:** a Tenant-Admin department-role-allowance editor; a full UX review of the new console.
- **T9b:** per-record cross-module classification (needs a product taxonomy); a retention-classes admin screen.
- **T8b:** hot-path metering integration + Redis counters; hard-cap 429 enforcement; Stripe sync + scheduled monthly
  invoices + 80/90/100% alert delivery; a usage/billing web screen; real plan figures.
