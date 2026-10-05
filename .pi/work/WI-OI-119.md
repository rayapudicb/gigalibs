# WI-OI-119 evidence: production-readiness audit

Card: `.pi/tasks/WI-OI-119.md` (approved by the owner 2026-10-04). Release verdict: **NO-GO** (unchanged).
Deliverables: `docs/audits/2026-10-04-production-readiness/`.

## Method

- Four read-only auditors (P1 product/WI, P2 frontend, P3 backend/data/integration, P4 security/ops/release)
  wrote findings to the session scratchpad only. The primary agent re-verified every P0/P1 before recording it.
- Runtime checks were read-only: `docker ps`/`docker inspect`, and `SELECT` statements on the local `gigalibs`
  database (`gigalibs-postgres`, host port 5440). Nothing was restarted, deployed or written.
- `git status` was checked after the auditors finished to prove that no repository file changed.

## Primary-agent verified runtime evidence (2026-10-04, ~16:00–16:30Z)

| # | Check | Command / query | Result |
| --- | --- | --- | --- |
| RT-1 | Running image | `docker ps` | All 7 app containers run `007e686bebee-c1746f0b541b`, created 2026-10-04T07:06Z. `.pi/NOW.md` still says `3da222030dc2-a0ca08f61655`; this deploy is not recorded in NOW.md or `infra/compose/evidence/` (latest folder 2026-09-28). A backup `gigalibs_backup_20261004_061720Z` exists. |
| RT-2 | Phase code in the running image | `git merge-base --is-ancestor <sha> 007e686` | In: 917141a (110), ad7f83b (111), 2f18945 (112), 2890f10 (091), 155061d (092), 5d1aa3a (093). **Not in:** e532d98 (113), a8207c4 (094), b799abd (095), eb7391a (114), 51c9ad8 (115), babd0b9 (116), d731c05 (117), 10bbfba (118). |
| RT-3 | Deployed modules | `docker inspect …module-host-1` labels | module-host depends on product-catalogue, universal-inventory, universal-orders and universal-procurement migrations. No financial-operations service runs. |
| RT-4 | Untracked migrations applied | `select … from public._prisma_migrations` | `20260923590000_tp2_cancelled_enum_predecessor` and `20261002000000_database_extensions_foundation` (both **untracked**) were applied 2026-10-04 06:41:47Z. 53 distinct applied names = 51 committed + these 2. `20260903007000_outcome_classification_snapshot` has one failed and one successful row. |
| RT-5 | Finance migrations applied before commit | `gigalibs_finance.schema_migrations` vs commit times | Versions 1–7 applied 07:32Z–14:36Z; each applied before its commit (e.g. v1 07:32Z vs a8207c4 10:05Z). The table records only `version, applied_at` (no checksum), so drift between applied SQL and committed files cannot be ruled out. |
| RT-6 | Proof data in the live local DB | `pg_stat_user_tables`, join to `public.tenants` | Finance: 107 books, 610 journal lines, 96 budget lines across 83 tenant IDs; 0 of 107 books belong to a registered tenant. Inventory/procurement: 0 of 15 sampled rows belong to a registered tenant. Proof data is unattributed and mixed into the owner's live local database (no real tenant data affected). |
| RT-7 | Lockfile drift at HEAD | `pnpm verify --audits` auto-install | The install added `@gigalibs/financial-operations-api` (apps/module-host) and `@gigalibs/financial-operations-web` (apps/workflow-platform) to `pnpm-lock.yaml`; both were added to `package.json` in a8207c4 without the lockfile. A frozen-lockfile install fails at HEAD. The primary agent restored the committed lockfile (`git checkout -- pnpm-lock.yaml`); the diff is kept in scratch evidence. |
| RT-8 | Data-integrity gate blind spots | `scripts/verify-runtime-data-integrity.mjs:21-40,73-132` | Roots omit 9 registered modules (universal-inventory, universal-procurement, universal-orders, financial-operations, product-catalogue, saga-orchestrator, ontology, communications, document-scanner) and apps/module-host; no pattern for `default-tenant`, `default-org`, or "sample data". `audit:production-data` therefore passes while production-reachable sample/default data exists. |
| RT-9 | `pnpm verify --audits` baseline | `pnpm verify --audits` | PASS (1 known drift: WORKFORCE_API_URL). Log `/var/folders/.../gigalibs-verify/verify-2026-10-04T16-19-05-154Z.log`. Passing gates do not contradict RT-8: the gates do not cover the defects. |
| RT-10 | Workspace includes untracked code | `pnpm-workspace.yaml:6-10` | `modules/*/apps/*`, `modules/*/web`, `modules/*/domain` globs include the untracked `modules/communications-textfly` and `modules/platform-rbac`; local build/test results are not evidence about the committed tree alone. |

## Auditor findings

Full auditor reports: session scratchpad `audit/P1-product-wi.md`, `P2-frontend.md`, `P3-backend.md`,
`P4-security-ops.md`; consolidated into `docs/audits/2026-10-04-production-readiness/`.

### P4 security/ops/release — primary-agent validation (2026-10-05)

| ID | Sev | Finding | Primary-agent re-check | Verdict |
| --- | --- | --- | --- | --- |
| S-01 | P0 | workflow-studio, universal-rule-pro, universal-data-studio take tenant from `x-tenant-id` / body; no guards | `execution.controller.ts:8-23`, `evaluator.controller.ts:11-17`, `lineage.controller.ts:8-18`; 0 files with guards in each API | CONFIRMED (not deployed today; rule-pro and workflow-studio readiness REVIEW) |
| S-02 | P0 | No restore of the current schema set; no PITR/WAL archiving; DR runbook claims RPO < 1 min | Last restore `wi-oi-046-tp1-20260924T131638Z/restore.json` (2026-09-24); no `archive_mode`/`archive_command` in `infra/`; `docs/runbooks/database-disaster-recovery.md:5` | CONFIRMED |
| S-03 | P1 | CMMS and Workforce APIs have not run since the 2026-10-04 07:06Z redeploy | `docker ps -a`: both `*-migrations-1` Exited (1); APIs `Created`. CMMS: `type "gigalibs_cmms.user_ref" does not exist`; Workforce: `migration ledger is 19; expected exactly 25` | CONFIRMED |
| S-04 | P1 | HEAD cannot be built from a clean checkout | `infra/compose/docker/Dockerfile:26-27` COPY untracked `control-migration-policy.mjs`, `run-control-migrations.mjs`; `packages/db/package.json:24`; `Dockerfile:37` copies the untracked migrations; plus RT-7 frozen-lockfile drift | CONFIRMED |
| S-05 | P1 | module-host cannot start at HEAD | `financial-operations/apps/api/src/config.ts:9` (`SCHEMA_CONTRACT_VERSION = 7`), `infra/compose/generated/compose.module-host.yaml:165` (`"6"`), `db/runtime-manifest.txt` omits 000007, `module-sdk/src/module-runtime-config.ts:43-47` (min = max = contract version) | CONFIRMED in code; runtime PLAUSIBLE |
| S-06 | P1 | Verify scripts leave a login role in the live local DB | `pg_roles`: `rls_test_user` `rolcanlogin = t`; created at `scripts/verify-period-close-and-forecasting.mjs:668` with a hard-coded password, and in 6 sibling scripts | CONFIRMED |
| S-07 | P1 | Finance org-replica tables without RLS | Live DB: `gigalibs_finance.org_replica_{closure,units,versions}` `relrowsecurity = f`; all other module replicas `t/t` | CONFIRMED |
| S-08 | P1 | No API-level tests for the hosted commercial modules | `git ls-files` test files: universal-inventory 0, universal-orders 0, universal-procurement 0, product-catalogue 1 | CONFIRMED |
| S-09 | P1 | Public password login has no throttle or lockout | `auth.controller.ts:230-233` `@Public() @Post('login')`; `auth.service.ts:89-123` no attempt/lock logic; lockout only in TOTP (`:642-663`); APP_GUARDs are JWT/Tenant/RBAC only (`app.module.ts:259-261`) | CONFIRMED |
| S-10 | P1 | WI-OI-008 claims CI security gates that do not exist | Only `.github/workflows/repository-governance.yml`, running 6 governance scripts (no build/test/SAST/secret/dependency/container/IaC/SBOM/signing) | CONFIRMED |
| S-11 | P1 | Release-control evidence is specification, not results; no named human reviewers/release authority; no production deployment artifact; no scan/SBOM for running or HEAD images | Accepted from P4 report with citations; spot-checked CI and evidence-folder dates | PLAUSIBLE→accepted for backlog; to be re-verified in the remediation card |
| S-12 | P2 | Live third-party credentials in untracked, git-ignored `.env` files under `modules/communications-textfly/apps/agent-runtime/` | Not opened by the primary agent (secret material). Owner decision: rotate | Reported, not opened |

P2/P3 items (platform-context key id/replay, missing CSP/security headers, Origin checks, Secure cookie, module
metrics/traces/SLOs, unreachable finance PUT/DELETE routes) are carried into deliverables I and K.

### P2 frontend/user-flow — primary-agent validation (2026-10-05)

107 committed `page.tsx` (21 generated, 86 hand-written) and 91 `route.ts`. Counts from the auditor: P0 10, P1 19,
P2 14, P3 8.

| ID | Sev | Finding | Primary-agent re-check | Verdict |
| --- | --- | --- | --- | --- |
| U-01 | P0 | `/finance`, `/procurement`, `/orders`, `/inventory` render static/sample business data; procurement and orders default to `default-tenant`/`default-org`; inventory simulates barcode resolution | Lines re-read (see Method); generated pages pass no props (`app/(app)/finance/page.tsx`); 0 fetch calls in the four workspaces; no page-level gate (sidebar hides PLANNED modules only) | CONFIRMED |
| U-02 | P0 | Communications BFF serves an in-memory store seeded per tenant, reports `DELIVERED` without a provider, and silently falls back to it on upstream failure | `lib/communications-store.ts:132,578-583`; `app/api/communications/[...path]/route.ts:97-100` | CONFIRMED |
| U-03 | P0 | Simulated softphone/WhatsApp drawer on every authenticated page | `app/(app)/layout.tsx:94`; `VoiceCallPanel.tsx:175-180` | CONFIRMED |
| U-04 | P0 | GigaOps › Time renders a static PlantOperationsHub with `setTimeout`-faked records | `GigaOpsWorkforceWorkbench.tsx:42,165`; `PlantOperationsHub.tsx:265,295` | CONFIRMED |
| U-05 | P0 | Rule Studio kernel PATCH updates any rule by ID with no tenant comparison; body spread can overwrite tenant/scope; store is in-memory | `app/api/rules/kernel/rules/[ruleId]/route.ts:36`; `lib/universal-rule-kernel-store.ts:533-545` | CONFIRMED |
| U-06 | P0 | Connector credential "saved" after an 800 ms `setTimeout`, no request | `app/(app)/connectors/[slug]/page.tsx:46-49` | CONFIRMED |
| U-07 | P0→P2 | Localization Save shows success while `/api/user/locale` is `unavailableCapability` | `app/api/user/locale/route.ts:5-6` | CONFIRMED; severity lowered to P2 by the primary agent (no business data) |
| U-08 | P1 | Signed module proxy drops `Idempotency-Key` and `If-Match` on every module write; Product Catalogue requires `Idempotency-Key` | `lib/signed-module-proxy.ts:107-112` | CONFIRMED |
| U-09 | P1 | `DictionaryRenderer` defaults to `permissions = ['*']` (fails open) | `packages/configuration-react/src/DictionaryRenderer.tsx:105` | CONFIRMED |
| U-10 | P1 | GigaOps offline punch queue in `localStorage` under a fixed key, not cleared on logout | `TimeAndAttendance.tsx:23-24` | CONFIRMED (key); cross-user submission PLAUSIBLE |
| U-11 | P1 | No page-level readiness/entitlement gate on 16 locked routes; CMMS has 37 unroutable API functions; GigaOps `/wfo/*` unroutable; public `/demo/index.html` with fake AR data and unpinned CDN scripts; Application Dictionary silently falls back to a hard-coded dictionary; governance claims "✅ Certified" finance workspace (`.pi/work/WI-OI-094.md:41`) | Accepted from P2 with citations | PLAUSIBLE→accepted for backlog |

### P1 product/WI — primary-agent validation (2026-10-05)

115 registry rows assessed; 62 proposed corrections (downgrade-only). Highest truthful gate anywhere: G4-local.

| ID | Sev | Finding | Primary-agent re-check | Verdict |
| --- | --- | --- | --- | --- |
| W-01 | P0 | "G0–G6 Proved" claimed for WI-OI-110 and WI-OI-111 | `.pi/WORK_ITEMS.md:132-133` | CONFIRMED (G6 needs named release authority and an immutable artifact; neither exists) |
| W-02 | P0 | Committed tree cannot be built or freshly installed (untracked runtime scripts and fix migrations) while evidence says the fix is proved | Same as S-04; `007e686` (titled docs) changed `packages/db/package.json` and `packages/db-migrations-runtime/package.json` | CONFIRMED |
| W-03 | P1 | Phases 4–14 contradict recorded owner decisions without amendment | `gigaops-convergence-roadmap.md:32` "No general ledger in this programme"; `ADR-0013:75` | CONFIRMED |
| W-04 | P1 | Reserved WI IDs reused: 093/094/095 were Inspections & Safety, Resource Planning, EAM | `docs/plans/manufacturing-package-solution-plan.md:231-233` | CONFIRMED |
| W-05 | P1 | ADR-0024 and ADR-0026 are Proposed while governance says "approved"/"amended" | ADR status lines | CONFIRMED |
| W-06 | P1 | Frozen AR module changed in e532d98 (+325 lines `invoices.service.ts`, migration 000014) | `git show --stat e532d98 -- modules/accounts-receivable` | CONFIRMED |
| W-07 | P1 | Mislabeled commit `007e686` ("docs(governance)") carries runtime, compose and migration-runner changes | `git show --stat 007e686` (17 files, kernel-worker, compose, package.json) | CONFIRMED |
| W-08 | P1 | Security-sensitive edits inside unrelated commits | `a8207c4` edits `physical-operations-cmms/.../authorization.ts`; `2f18945` edits `module-sdk/src/signed-context.ts` | CONFIRMED |
| W-09 | P1 | No independent review; compliance claims (IFRS/IAS/ASC) without accounting review; AGPL benchmark without legal review; no FRs exist for Phases 5–14 | Accepted from P1 with citations | PLAUSIBLE→accepted for backlog |

## Incident: the primary agent wrote to the owner's local database (2026-10-04 16:19Z)

- **What happened:** `pnpm verify --audits` (run as the card's baseline) also runs seven finance proof scripts
  (`scripts/verify.mjs:32-38`, outside the `--audits` switch). They connect to
  `localhost:5440/gigalibs` by default (`scripts/verify-financial-operations.mjs:28`) and insert proof data.
- **Effect:** 9 accounting books and 26 GL journals (plus dependent rows) created at 2026-10-04 16:19:09Z in
  `gigalibs_finance`, under unregistered test tenant IDs. No registered tenant's data was affected. Correction
  (2026-10-05): RT-6's 107 books were counted before this run, so these rows are not in RT-6's totals; the table holds
  116 books afterwards (re-checked 2026-10-05, newest row still 2026-10-04 16:19:09Z).
- **Containment:** the primary agent will not run `pnpm verify` again under this card. Final verification will run
  the static audit scripts individually. Removing the rows requires owner approval.
- **Root cause:** the mandatory gate writes to the owner's database (backlog item; see P1 F-10 and S-06).

### P3 backend/data/integration — primary-agent validation (2026-10-05)

| ID | Sev | Finding | Primary-agent re-check | Verdict |
| --- | --- | --- | --- | --- |
| B-01 | P0 | Costing/consolidation post a GL journal in its own committed transaction, then fail on the outbox write; no idempotency | `costing.service.ts:184,254,310`; `consolidation.service.ts:124,510,652` writes `${SCHEMA}.outbox`; live DB has only `gigalibs_finance.outbox_events` with 10 NOT NULL, no-default columns that the costing/budgeting inserts omit | CONFIRMED (static + live schema) |
| B-02 | P0 | SCIM: no permission check; role from input; `default-system-tenant` fallback | `scim.controller.ts:62-118`; `scim.service.ts:182`; `rbac.guard.ts:31-32` allows when no metadata; `tenant-boundary.guard.ts:32-50` checks membership when a tenant is requested | CONFIRMED (in-tenant escalation; cross-tenant blocked by membership) |
| B-03 | P0 | AR payment webhooks use built-in fallback HMAC secrets; tenant/invoice from payload | `webhooks.controller.ts:47,61-62,96` (values not reproduced) | CONFIRMED (code) |
| B-04 | P0 | Multi-currency CTA = `netExposure × 0.005` labelled ASC 830/IAS 21 | `revaluation.service.ts:59` | CONFIRMED |
| B-05 | P0 | Connector Hub webhook: tenant from `x-tenant-id`; signature only if a secret exists | `webhooks.controller.ts` (header read), `webhooks.service.ts:128-156` | CONFIRMED (code); public exposure depends on ingress |
| B-06 | P1 | ERP revocation tables lack the columns the SDK guard queries | Live `information_schema`: finance/inventory/orders/procurement lack `revocation_type, session_id, subject_id, invalid_through_auth_version`; product-catalogue matches `module-sdk/src/database.ts:139-150` | CONFIRMED (schema); 503 behavior PLAUSIBLE |
| B-07 | P1 | Orders `inbox/invoices` accepts `any` body with `orders:read` | `orders.controller.ts:168-172` | CONFIRMED |
| B-08 | P1 | Tenant GUC `set_config(…, true)` outside a transaction | `tax-configuration/.../database.service.ts:84` | CONFIRMED (code); effect PLAUSIBLE |
| B-09 | P1 | Second partial allocation of an order line always fails | `orders.service.ts:501-505` (aggregate_version fixed at 1) vs `000002_orders_outbox_inbox_relay.up.sql:23` UNIQUE | CONFIRMED |
| B-10 | P1→P2 | Float money in AR work-source billing | `work-sources.service.ts:168`: one multiply by fractional quantity, then `Math.round` to minor units | CONFIRMED; lowered to P2 (no accumulating drift; rounding policy still undefined) |
| B-11 | P1 | Prototypes fail open; Governor caller-chosen tenant | Not re-checked | PLAUSIBLE |

## Owner brief leads A–P

| Lead | Result | Where |
| --- | --- | --- |
| A WI-OI-013 blocker | Reproduced; still No-Go | README P1-29; Appendix P4 §6 |
| B Stale runtime | Reproduced, with a correction: the running image is `007e686` (unrecorded deploy), not `3da2220`; Phases 2–7 are in it, 113 and 8–14 are not | RT-1, RT-2 |
| C Status contradictions | Reproduced; 94 downgrade-only corrections applied | "Status corrections" below |
| D Frontend shells | Reproduced (P0-01); Phase 1–4: Organization admin traces end to end; Parties has no edit controls; Catalogue blocked at the proxy; Application Dictionary silently falls back | README §3; Appendix P2 |
| E Missing consumers | Reproduced | README P1-04 |
| F Event-contract drift | Reproduced; plus split invoice authority and no posted-vendor-bill event | README P1-04, P1-08 |
| G Budget disconnected | Reproduced | README P1-06 |
| H Period lock | Reproduced | README P1-07 |
| I Costing not a consumer | Reproduced; plus orphan journals | README P0-09; §6 |
| J Procure-to-pay | Broken | README §6 |
| K Order-to-cash | Broken | README §6 |
| L Inventory authority | Reproduced (CMMS part balances beside Universal Inventory) | README P1-08 |
| M Asset authority | Reproduced (optional unvalidated UUID link) | README P1-08 |
| N Finance traceability | Reproduced; manifest change deferred to R7 (manifests are out of this card's scope) | P1 drift D-58 |
| O Module readiness | Confirmed not promoted (still `0.1.0-dev`/implementation/PLANNED); no change made | — |
| P Mobile | Reproduced: no PWA manifest or service worker; WI-OI-084 not started | README D3 |

## Status corrections (downgrade or correction only)

Applied by `scratchpad/apply_corrections.py` with exact-match assertions; 94 changes across 27 files:

- `.pi/WORK_ITEMS.md`: 42 rows annotated `**WI-OI-119 audit (2026-10-05):**`.
  - Gates corrected for WI-OI-003, 008, 011, 012, 014–017, 081, 082, 109–118, 091–095, WI-WFO-001–006 and
    WI-EAM-001–005.
  - Statuses: WI-OI-074 Ready→Blocked; WI-EAM-001–005 "In Review"→Review.
  - 19 eight-cell rows merged into the 7-column shape.
- Task cards and evidence: status lines for WI-OI-091, 092, 093, 095, 103, 109 (two Done boxes reopened), 110,
  111, 112, 113, 118 and evidence files for WI-OI-013, 019, 035, 040, 080–082, 091–093, 095, 110, 112, 113.
- `config/sdlc-governance.json`: WIP note, note_WI-OI-053/055/056/057 (frozen) and note_WI-OI-104.
- Deferred to R7 (outside this card's scope): D-04 `FOUNDATION-CLOSE.md`, D-30 audit script, D-38/39
  `PLAN.md`, D-51 WI-EAM cards, D-55–D-57 ADRs, D-58/59 manifests, D-60 review document.

## Verification

- `node scripts/verify-sdlc-governance.mjs`: PASS after the corrections.
- Static audits run individually (not `pnpm verify`, which writes to the owner's database): see the result line
  below.
- No product code, migration, manifest, database or running service was changed by the primary agent, apart from
  the incident above. `pnpm-lock.yaml` was restored.
- Result (2026-10-05, after the corrections): `audit:production-data`, `audit:all-runtime-data`,
  `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:sdlc`, `audit:layers` PASS;
  `module-manifests.mjs --check` PASS (no errors); deployment profile reports only the known `WORKFORCE_API_URL`
  drift (ENV_UNKNOWN, ENV_EXAMPLE_DRIFT). The seven finance proof steps were not re-run (they write to the owner's
  database). `pnpm build` and `pnpm test` were not run: this card changes documentation only.
- Passing audits do not contradict the findings: RT-8 shows the data gate does not cover the defective modules.

## Owner decisions after the audit (2026-10-05)

- Containment proposal R1 (WI-OI-120a as first drafted) **withdrawn** by the owner: nothing is hidden or removed;
  every module is fixed for UAT. WI-OI-120a now holds U1.
- The runner (`packages/db-migrations-runtime/control-migration-policy.mjs`, `run-control-migrations.mjs`), the
  policy test and migrations `20260923590000_tp2_cancelled_enum_predecessor` and
  `20261002000000_database_extensions_foundation` are to be committed. The primary agent reviewed them on 2026-10-05:
  no secrets; the enum repair is idempotent; the extensions migration converges `pgcrypto`, `ltree` and
  `btree_gist` into `public` (a possible factor in the CMMS failure, to check in U1); the runner records three
  retired cross-module migrations as applied, under an advisory lock, and fails closed on unresolved history.
  `vitest` policy test: 5/5 pass.
- The existing local instance is the UAT instance. AR is in UAT scope. UAT data comes from Playwright business
  flows. The never-built spec capabilities are planned as Stage 4.

## Post-audit finding (2026-10-05, raised by the owner from the UAT instance)

- **Design standard not applied (P1 for UAT, P2 otherwise).** Owner rule (`.pi/handoff/HANDOFF-2026-09-29.md:81`):
  web screens use `@medusajs/ui` and the `ui-*` tokens, with no hard-coded colours.
- Every screen added in Phases 2–14 instead uses hard-coded dark Tailwind colours, with no tokens and no Medusa
  components. Counts of hard-coded colour classes / token classes / Medusa imports:

  | Screen | Hard-coded | Tokens | Medusa |
  | --- | --- | --- | --- |
  | `FinancialOperationsWorkspace.tsx` | 664 | 0 | 0 |
  | `ProductCatalogueWorkspace.tsx` | 359 | 0 | 0 |
  | `PartyWorkspace.tsx` | 290 | 0 | 0 |
  | `ApplicationDictionaryWorkbench.tsx` | 251 | 0 | 0 |
  | `UniversalOrderWorkspace.tsx` | 202 | 0 | 0 |
  | `UniversalProcurementWorkspace.tsx` | 166 | 0 | 0 |
  | `DictionaryRenderer.tsx` | 47 | 0 | 0 |
  | `UniversalInventoryWorkspace.tsx` | 10 | 0 | 0 |

- Compliant for comparison: CMMS (`CmmsWorkOrders.tsx`, 58 token classes, Medusa) and Organization administration.
- **Effect:** the dark pages clash with the light shell. White headings are invisible on the light page background
  (WCAG 2.2 AA contrast failure), and error text has low contrast.
- No automated check enforces the rule, so every audit passed. The WI-OI-119 frontend auditor did not report it.
- **Related:** the Products screen's "HTTP 403" comes from the web BFF access check, not the module. No tenant holds
  an entitlement for `product-catalogue`, `universal-inventory`, `universal-procurement`, `universal-orders` or
  `financial-operations` (`public.tenant_module_entitlements`, checked read-only 2026-10-05).
