# Phase 3 batch — review & deploy brief (2026-10-26)

**For:** the independent reviewer (Security for the access/persona work; Finance + Security for metering/billing) and
the owner/deployer. **Branch:** `feat/gigaops-convergence-core`. Not yet deployed.

Completes **every remaining buildable Phase 3 plan item** (R16, S17, T9b, T8b, T11b, R15, X1, X2). Each is a
self-contained use case with its own commit; detail is on the task cards. Only genuinely external pieces are left
(SAML needs a provider; live SCIM-group push needs an IdP; the broader X1 findings and a live timing benchmark).

## Commits (range `2506b37a` … `21905981`)

| Commit | Item | Card |
| --- | --- | --- |
| `2506b37a` | **R16** Personas from roles — capability-aware `determinePersona` | `.pi/tasks/WI-OI-120p.md` |
| `51d8a9d3` | **S17** People administration console (bulk invite, tracker, grant, off-board) | `.pi/tasks/WI-OI-120p.md` |
| `a630bae0` | **T9b** Retention classes + purge wiring | `.pi/tasks/T9b-retention-classes.md` |
| `f8e0d7ad` | **T8b** Usage metering, plan quotas, billing hand-off | `.pi/tasks/WI-OI-015-T8b.md` |
| `b91b6fbd` | **T11b** Full set-up wizard (derived progress) | `.pi/tasks/T11b-setup-wizard.md` |
| `a0953457` | **R15** Directory groups → scoped roles (OIDC pre-existing; SAML gated) | `.pi/tasks/R15-directory-groups.md` |
| `2b4a9927` | **X1** Design-token conformance for this session's new UI | `.pi/tasks/X1-design-token-conformance.md` |
| `21905981` | **X2** Day-1 onboarding task benchmark (measurement, not a gate) | `.pi/tasks/X2-day-one-benchmark.md` |

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
- **R15 (Security):** directory-group → scoped-role mappings only grant what a Tenant Admin could grant by hand — every
  grant runs through `resolveRoleScope` + the scope (R5 allow-list), duty-conflict and role-limit invariants. Reconcile
  touches only `directory-sync`-sourced assignments; manual grants are never changed. Confirm the reconcile is
  all-or-nothing and that `current/directory-group-sync` (the connector seam) is gated.

## Migrations (control-plane, additive)

Three new, additive migrations in `packages/db/migrations/` — run all three on deploy:
- `20261026000000_retention_classes` — `RetentionBasis` enum + `retention_classes` table + nullable
  `tenant_environments.retentionClassId` FK (SET NULL). Partial unique index: one live default class per tenant.
- `20261026010000_usage_counters` — `usage_counters` table (unique per tenant+period+meter).
- `20261026020000_scim_group_role_mappings` — `scim_group_role_mappings` table (unique per tenant+group+role; reuses
  the existing `MemberRoleScope` enum).

All are new-table/new-nullable-column only; nothing backfills, and pre-existing rows are unaffected. The generated
Prisma client is rebuilt at image build (not committed), so a control-plane rebuild picks the new models up.

## New control-plane permission

`billing:read` added to `CONTROL_PLANE_PERMISSIONS` (workspace administrators already hold `billing:*`). R15 reuses the
existing `roles:assign` / `roles:read`. New models `RetentionClass`, `UsageCounter` and `ScimGroupRoleMapping` are
classified in `config/package-layers.json` (`audit:layers` clean).

## Deploy notes

- **Rebuild:** the control-plane API (`playground-api` — T9b/T8b/R15 services, endpoints, worker) and the web shell
  (`workflow-platform` — R16 persona, the S17 console, the T11b `/setup` wizard). R16/R15/T11b/X2 also change
  `@gigalibs/contracts`; R16 changes `@gigalibs/auth-core`; R15 changes `@gigalibs/tenancy-nest`.
- **Run** the three migrations above against the control-plane database.
- Modules (CMMS, ERP, etc.) are **not** changed by this batch.

## Verification evidence (local)

- Typecheck: `@gigalibs/contracts`, `@gigalibs/auth-core`, `@gigalibs/workflow-platform`, `@gigalibs/app-playground-api`,
  `@gigalibs/tenancy-nest` all green.
- Unit tests: contracts full suite **403 pass** (incl. new `persona-from-roles` 10, `retention-class` 7,
  `usage-metering` 8, `directory-groups` 8, `setup-progress` 6, `day-one-benchmark` 3); web
  `persona-routing`/`executive-control-tower`/`people-admin-parse`/`people-administration`/`setup-wizard` green;
  playground-api `retention-class.service` 5, `usage-metering.service` 5.
- `audit:layers` clean; `permission-catalogue` green; `audit:design-tokens` now passes for this session's web files
  (the three files it still flags — `maps/page`, `AuthAtmosphere`, `PlantSpatial3DViewer` — were already dirty at
  session start and are not this session's work). New files lint clean; pre-existing biome debt in edited files untouched.
- DB integration tests for the new control-plane services (retention classes, usage counters, R15 reconcile) are
  **deferred** (mocked-Prisma/pure specs cover the logic; a real-DB test would also exercise the partial-unique-index and
  the atomic increment / grant-revoke apply end to end).

## Deferred follow-ups (flagged on the cards)

- **R16:** none material.
- **S17:** a Tenant-Admin department-role-allowance editor; a full UX review of the new console.
- **T9b:** per-record cross-module classification (needs a product taxonomy); a retention-classes admin screen.
- **T8b:** hot-path metering integration + Redis counters; hard-cap 429 enforcement; Stripe sync + scheduled monthly
  invoices + 80/90/100% alert delivery; a usage/billing web screen; real plan figures.
- **T11b:** a post-sign-up redirect / dashboard banner to the `/setup` wizard; a persisted dismiss; inline in-wizard
  actions; an active-pack signal for the packs step.
- **R15:** **SAML SSO** (absent — needs a provider + SP library decision; OIDC already covers SSO login); wiring SCIM
  `PATCH /Groups` membership to `reconcileMemberDirectoryGroups` (needs a real IdP to test end to end); an admin UI for
  the mappings.
- **X1:** the three non-conforming files above (not this session's), plus the 37 layout + 17 accessibility findings and
  hiding internal codes — all catalogued across the WI-OI-120b sub-cards.
- **X2:** a live end-to-end timing benchmark against a running stack; Assistant task-completion once an eval harness
  exists.
