# GigaLibs production-readiness audit (WI-OI-119)

- **Date:** 2026-10-04 to 2026-10-05
- **Scope:** the whole committed production candidate at `76b9452`: 23 registered modules, 107 web pages, 91 BFF
  route handlers, 182 controllers, 197 migrations and all 115 registry rows. The running local system was also
  inspected.
- **Method:** four read-only auditors, plus primary-agent re-verification of every P0/P1 below against code, git
  or read-only database and container queries. Evidence: `.pi/work/WI-OI-119.md`.
- **Release verdict: NO-GO.** Nothing in this audit supports changing it.

## 1. Executive summary

1. **No work item has reached G5, G6 or G7.** The highest truthful gate anywhere is a local G4 with no independent
   review. Two registry rows claimed "G0–G6 Proved"; both are withdrawn.
2. **The committed code cannot be built, freshly installed or started.**
   - The image build and the migration runner depend on files that were never committed.
   - The lockfile is out of date with the committed `package.json` files.
   - The module host refuses to start at HEAD because of a Finance schema-version mismatch.
3. **Production-reachable pages show fake business truth.**
   - Finance, Procurement, Orders and Inventory render static or sample data, and Procurement and Orders run as
     `default-tenant`.
   - Communications reports messages as delivered without a provider.
   - A simulated softphone sits on every page.
   - Several other screens fake success with timers.
4. **The ERP modules from Phases 5–14 do not work together.** No relay or consumer exists for any declared ERP event.
   - Budget checks are never called by Procurement.
   - Period locks are enforced only inside Finance.
   - Costing and consolidation post GL journals and then fail, leaving orphan or duplicate journals.
5. **Confirmed security defects:**
   - SCIM lets any member create users with any role.
   - AR payment webhooks have built-in fallback secrets.
   - Rule Studio rules can be changed across tenants.
   - Three studio APIs take the tenant from the caller.
   - Password login has no throttle or lockout.
6. **The local runtime is not what the records say.**
   - An unrecorded deploy (`007e686`, 2026-10-04 07:06Z) replaced the documented one.
   - CMMS and Workforce, the Release 1 modules, have not started since then.
   - Two never-committed migrations were applied to the local database.
   - Proof scripts, including `pnpm verify`, write test data into the owner's local database.
7. **The work contradicts the owner's recorded decisions.**
   - The 2026-09-28 decision set Release 1 to manufacturing (core + CMMS + Workforce + Geospatial).
   - The roadmap says "No general ledger in this programme".
   - Phases 4–14 built catalogue, inventory, procurement, orders and a full finance stack anyway.
   - Release 1's own must-haves (G-1 to G-4, mobile WI-OI-084) are still open.

## 2. Counts

| Severity | Consolidated (deduplicated, primary-verified or accepted) | Raw auditor totals (before deduplication) |
| --- | --- | --- |
| P0 | **13** | 22 |
| P1 | **29** | 65 |
| P2 | see appendices | 62 |
| P3 | see appendices | 27 |

WIs audited: 115 registry rows (104 WI-OI, 6 WI-WFO, 5 WI-EAM) plus WI-OI-119. Status corrections applied:
94 edits (downgrade or correction only) across 27 files; listed in `.pi/work/WI-OI-119.md`.

## 3. P0 register (stop-ship)

| ID | Finding | Evidence | Status |
| --- | --- | --- | --- |
| P0-01 | `/finance`, `/procurement`, `/orders`, `/inventory` render static/sample data; Procurement and Orders default to `default-tenant`/`default-org`; Inventory simulates barcode resolution; no page-level gate | `FinancialOperationsWorkspace.tsx:167`; `UniversalProcurementWorkspace.tsx:168-169`; `UniversalOrderWorkspace.tsx:172-173`; `UniversalInventoryWorkspace.tsx:207,486`; generated `app/(app)/*/page.tsx` | CONFIRMED |
| P0-02 | Communications BFF serves an in-memory seeded store, marks messages `DELIVERED` without a provider, silently falls back to it on upstream failure; simulated softphone drawer on every authenticated page | `lib/communications-store.ts:132,578-583`; `app/api/communications/[...path]/route.ts:97-100`; `app/(app)/layout.tsx:94`; `VoiceCallPanel.tsx:175-180` | CONFIRMED |
| P0-03 | Other fake success: GigaOps › Time renders a static hub with `setTimeout` records; connector credentials "saved" after an 800 ms timer with no request | `GigaOpsWorkforceWorkbench.tsx:165`; `PlantOperationsHub.tsx:265,295`; `app/(app)/connectors/[slug]/page.tsx:46-49` | CONFIRMED |
| P0-04 | Rule Studio kernel updates any rule by ID with no tenant check; the body can overwrite tenant/scope; the store is in-memory | `app/api/rules/kernel/rules/[ruleId]/route.ts:36`; `lib/universal-rule-kernel-store.ts:533-545` | CONFIRMED |
| P0-05 | Workflow Studio, Rule Pro and Data Studio APIs have no authentication and take the tenant from `x-tenant-id`/body | `execution.controller.ts:8-23`; `evaluator.controller.ts:11-17`; `lineage.controller.ts:8-18` | CONFIRMED (not deployed today) |
| P0-06 | SCIM user routes have no permission check, take the role from the request and fall back to `default-system-tenant` | `apps/playground-api/src/scim.controller.ts:62-118`; `scim.service.ts:182`; RBAC allows when no metadata (`rbac.guard.ts:31-32`) | CONFIRMED (cross-tenant blocked by membership check; in-tenant escalation open) |
| P0-07 | AR payment webhooks fall back to built-in HMAC secrets; tenant and invoice come from the payload | `accounts-receivable/.../webhooks.controller.ts:47,61-62,96` | CONFIRMED (code) |
| P0-08 | Connector Hub inbound webhook takes the tenant from a header; the signature is checked only if a secret is configured | `universal-connector-hub/.../webhooks.controller.ts`, `webhooks.service.ts:128-156` | CONFIRMED (code); exposure depends on ingress |
| P0-09 | Costing and consolidation post a GL journal in its own committed transaction, then fail on their outbox write; no idempotency, so retries post again | `costing.service.ts:184,254,310`; `consolidation.service.ts:124,510,652`; live schema has only `outbox_events` with 10 NOT NULL columns | CONFIRMED (static + live schema) |
| P0-10 | Multi-currency revaluation fabricates CTA as `netExposure × 0.005` and labels it ASC 830 / IAS 21 | `multi-currency/.../revaluation.service.ts:59` | CONFIRMED |
| P0-11 | Certification claims the evidence cannot support: "G0–G6 Proved" (WI-OI-110/111); finance "N/N certified" proofs are raw SQL that bypass the service code that fails | `.pi/WORK_ITEMS.md` (corrected); `scripts/verify-*.mjs` | CONFIRMED; registry corrected |
| P0-12 | HEAD cannot be built or freshly installed from git | `infra/compose/docker/Dockerfile:26-27,37`; `packages/db/package.json:24`; lockfile drift since `a8207c4` | CONFIRMED |
| P0-13 | No restore of the current schema set has ever been proven; no PITR/WAL archiving; the DR runbook's RPO < 1 min is unsupported | `infra/compose/evidence/wi-oi-046-tp1-20260924T131638Z/restore.json`; `docs/runbooks/database-disaster-recovery.md:5` | CONFIRMED |

## 4. P1 register

| ID | Finding | Status |
| --- | --- | --- |
| P1-01 | Module host cannot start at HEAD (Finance requires migration 7; generated compose sets 6; runtime manifest omits 000007) | CONFIRMED |
| P1-02 | Inventory, Orders, Procurement and Finance revocation tables lack the columns the SDK guard queries; authenticated routes are expected to fail (three of these run now) | CONFIRMED (live schema) |
| P1-03 | Budgeting, close and costing outbox inserts omit NOT NULL columns; consolidation targets a missing table | CONFIRMED |
| P1-04 | No relay or consumer for any declared ERP event; `ingestSubledgerEvent` has no caller; event names drift (`inventory.stock.issued.v1` undeclared, `inventory.stock.adjusted.v1` declared by no producer) | CONFIRMED |
| P1-05 | Inbox endpoints a user can forge (`orders inbox/invoices` with `orders:read` and `any` body; procurement and AR equivalents) | CONFIRMED (orders); others per P3 |
| P1-06 | Procurement evaluates no delegation of authority, no segregation of duties, no budget check, no audit, no events | CONFIRMED |
| P1-07 | Period/subledger lock enforced only inside Finance; `postJournal` blocks only `LOCKED` | CONFIRMED |
| P1-08 | Split masters: invoice (AR, Orders, control plane), stock (Inventory, CMMS), asset (CMMS, Finance), party/product via unvalidated UUID plus free text | CONFIRMED |
| P1-09 | A second partial allocation of an order line always fails (outbox unique key with fixed version 1) | CONFIRMED |
| P1-10 | `set_config(…, true)` outside a transaction in 8 modules, so the tenant setting is lost before the query | CONFIRMED (code); effect PLAUSIBLE |
| P1-11 | Prototype modules fail open on authentication; Governor takes a caller-chosen tenant | PLAUSIBLE (P3) |
| P1-12 | Frozen AR module (WI-OI-019) changed by WI-OI-113 and made a required module of Finance | CONFIRMED |
| P1-13 | CMMS and Workforce APIs have not started since the 2026-10-04 redeploy (migration failures) | CONFIRMED |
| P1-14 | Unrecorded deploy of `007e686`; NOW.md recorded the wrong image | CONFIRMED |
| P1-15 | Two untracked migrations applied to the live local DB; Finance migrations applied before their commits; no checksums | CONFIRMED |
| P1-16 | `pnpm verify` (including `--audits`) writes proof data to the owner's local DB and leaves a login role | CONFIRMED (including one run by this audit) |
| P1-17 | Data-integrity gate scans 14 of 23 modules and has no default-tenant/sample patterns; `audit:sdlc` skips WI-EAM rows | CONFIRMED |
| P1-18 | Finance org-replica tables have row-level security off | CONFIRMED (live) |
| P1-19 | Inventory, Orders and Procurement have no test files; no proof goes through HTTP or authorization | CONFIRMED |
| P1-20 | Password login has no throttle or lockout | CONFIRMED |
| P1-21 | CI runs only six governance scripts; no build, test or security gates; this branch has never been through CI | CONFIRMED |
| P1-22 | Release-control evidence (WI-OI-003, 005–007, 009, 010) is specification, not results; no named independent reviewers or release authority; no production deployment artifact; no scan/SBOM for running or HEAD images | Accepted (P4), spot-checked |
| P1-23 | Signed module proxy drops `Idempotency-Key` and `If-Match` on every module write | CONFIRMED |
| P1-24 | `DictionaryRenderer` defaults to `permissions = ['*']` | CONFIRMED |
| P1-25 | GigaOps offline punch queue in `localStorage` under a fixed key | CONFIRMED (key) |
| P1-26 | 16 locked routes have no page-level gate; 37 CMMS API functions are unroutable; GigaOps `/wfo/*` unroutable; public `/demo/index.html` with fake AR data; Application Dictionary silently falls back to a hard-coded dictionary | Accepted (P2) |
| P1-27 | Phases 4–14 contradict recorded owner decisions; WI-OI-093/094/095 IDs were reserved for other Release 1 work; Release 1 must-haves not started | CONFIRMED |
| P1-28 | Governance integrity: ADRs claimed approved while Proposed; producer self-acceptance; mislabeled commit `007e686`; security edits inside unrelated commits; IFRS/IAS/ASC claims without accountant review; AGPL benchmark without legal review | CONFIRMED (parts) |
| P1-29 | WI-OI-013 identity/control plane remains No-Go (SAML, WebAuthn, PITR/failover, named reviews missing; IdP, DNS/TLS, regional isolation external) | CONFIRMED |

Severity change by the primary agent: AR work-source billing multiplies by a fractional quantity and then rounds
to minor units once (`work-sources.service.ts:168`). It is recorded as P2, not P1, because no ledger drift
accumulates; the rounding policy still needs definition.

## 5. Verdict per work item (deep scope)

Verdicts are recommendations; **D1** below decides between Contain and Stop Investment for Phases 4–14.

| WI | Phase / wave | Truthful gate | Verdict | Main reason |
| --- | --- | --- | --- | --- |
| 003–010 | Release controls | ≤ G4 | Return for Remediation | Evidence is specification, not results; no named reviewers |
| 013 | Identity / control plane | G4 local | Return for Remediation (No-Go) | External IdP, SAML, WebAuthn, PITR, named reviews |
| 019 / 035 / 040 | AR | Frozen | Frozen (freeze breached) | Edited by WI-OI-113; required by Finance |
| 039 | Configuration foundation | G4 local | Return for Remediation | Self-accepted; renderer fails open |
| 080–083 | Wave 0 | G4 local | Return for Remediation | Checks miss P1-01; ADR-0013 contradicted by Phases 4–14 |
| 084 | Mobile | Not started | Return for Remediation (start or exclude: D3) | Release 1 must-have |
| 085 | Module generator | G4 local | Conditional (internal developer tool only) | No production exposure |
| 109 | Phase 1: organization | G4 partial | Return for Remediation | Fresh-install fix not in the committed tree |
| 110 | Phase 2: Application Dictionary | G4 partial | Return for Remediation | G6 claim withdrawn; silent fallback; fails-open renderer |
| 111 | Phase 3: Core Parties | G4 partial | Return for Remediation | No recorded proof ran the migration; parties referenced by unvalidated UUID |
| 112 | Phase 4: Product Catalogue | G4 partial | Contain | Unusable through the proxy; scope frozen by the owner's D7 list |
| 091 | Phase 5: Inventory | G4 partial | Contain | Parallel ledger to CMMS; simulated UI; guard schema mismatch |
| 092 | Phase 6: Procurement | G4 partial | Contain | No DoA/SoD/budget; static UI with default tenant |
| 093 | Phase 7: Orders | G4 partial | Contain | Split invoice authority; static UI; allocation bug |
| 113 | Convergence | G4 partial | Contain | No relay/consumer; edits frozen AR; ADRs Proposed |
| 094 | Phase 8: Finance/GL | G4 partial | Contain → Stop Investment recommended (D1) | No consumers; not deployed; contradicts "no GL" decision |
| 095 | Phase 9: Treasury | G4 partial | Contain → Stop Investment recommended (D1) | Same; bank data without security review |
| 114 | Phase 10: Fixed assets | G4 partial | Contain → Stop Investment recommended (D1) | Second asset master beside CMMS |
| 115 | Phase 11: Consolidation | G4 partial | Contain → Stop Investment recommended (D1) | Orphan journals (P0-09); no accountant review |
| 116 | Phase 12: Costing | G4 partial | Contain → Stop Investment recommended (D1) | Orphan journals (P0-09); no operational consumption |
| 117 | Phase 13: Budgeting | G4 partial | Contain → Stop Investment recommended (D1) | Outbox failure; Procurement never calls it |
| 118 | Phase 14: Close/forecast | Below G4 | Contain → Stop Investment recommended (D1) | Breaks HEAD start; locks not enforced outside Finance |

The full matrix for all 115 rows, with business-outcome answers per WI, is in Appendix P1, sections 1 and 4.

## 6. Integrated journeys (deliverable J)

None of the eight required journeys is achievable on the committed candidate. Every ERP step is also blocked by
P1-01 and P1-02.

| Journey | Result | First blocking links |
| --- | --- | --- |
| Tenant to first value | Not achievable for ERP; partial for core | Provisioning event has no producer/consumer; ERP modules cannot serve traffic; CMMS/Workforce down locally |
| Master data to operation | Disconnected | Parties and products referenced by unvalidated UUID with free-text names; no catalogue lookups or events |
| Procure-to-pay | Broken | DoA, budget check, commitment, AP/GL posting and payment missing; receipt event never relayed |
| Order-to-cash | Broken | No ATP or reservation link; invoice authority split; no bank link; AR frozen (D2) |
| Inventory-to-margin | Missing | No receipt→cost layer or issue→COGS consumption; AR never posts revenue |
| Asset lifecycle | Missing | CMMS and Finance assets linked only by an optional unvalidated UUID; no events |
| Budget-to-close | Broken | Outbox failures; commitments never created; locks unenforced outside Finance |
| Group close | Broken | Elimination posts then fails; minority interest not applied |

Detail per step: Appendix P3, section 5.

## 7. Deliverable index

| Deliverable | Where |
| --- | --- |
| A Executive release report | This file |
| B Phase/WI matrix (all 115 rows) | Appendix P1 §1 |
| C File-change inventory (14 phase commits, 520 files) | Appendix P1 §3 |
| D Functional-action matrix | Appendix P2 §2 (route inventory §1, UI states §3) |
| E API gap register | Appendix P3 §3 |
| F Database/migration gap register | Appendix P3 §4, plus runtime checks RT-4/5 in `.pi/work/WI-OI-119.md` |
| G Mock/demo/stub/default/static-data inventory | Appendix P2 §5 |
| H Event/transaction matrix | Appendix P3 §2 |
| I Security/tenant/RBAC/object-authorization matrix | Appendix P4 §1, BFF handlers in Appendix P2 §4 |
| J Integrated-journey matrix | §6 above; Appendix P3 §5 |
| K Observability/SLO/runbook/backup/restore matrix | Appendix P4 §4 |
| L Prioritized remediation backlog | `remediation-backlog.md` |

## 8. Decisions only the owner can make

- **D1 Release scope.** Confirm Release 1 = manufacturing (2026-09-28). If so, Phases 4–14 stay contained and the
  finance stack (094/095/114–118) is a Stop Investment candidate. Otherwise, record an amendment to the roadmap and
  ADR-0013.
- **D2 AR.** Keep WI-OI-019 frozen (and remove Finance's dependency and the 113 AR edits from the release), or
  unfreeze it.
- **D3 Mobile (WI-OI-084).** Start it as a Release 1 must-have, or exclude it explicitly.
- **D4 Untracked runner and migrations.** Review and commit them (they are already applied locally), or remove the
  committed references and write forward migrations.
- **D5 Local database clean-up.** Approve removal of unattributed proof data (including rows created by this
  audit's `pnpm verify --audits` run) and of the `rls_test_user` role.
- **D6 Credentials.** Rotate the live third-party credentials found in untracked `.env` files under
  `modules/communications-textfly/`.
- **D7 Named humans.** Appoint independent Security, QA, Product, Accounting and Legal reviewers and a release
  authority. No agent can fill these roles.

## 9. Release recommendation

**NO-GO.** Before any certification resumes:

1. Contain the production-reachable fakes and unsafe endpoints (R1).
2. Make HEAD reproducible: committed runner, current lockfile, consistent runtime manifests, CI build and test,
   verification that never writes to the owner's database (R2).
3. Close the confirmed security P0s (R3).
4. Restore the local CMMS/Workforce runtime with recorded, owner-approved migrations (R4).
5. Apply D1 before investing further in Phases 4–14.

The full backlog is in `remediation-backlog.md`.

## 10. Owner decisions recorded on 2026-10-05

The owner chose to **fix every module for UAT rather than contain any of it**. Details and their effect are in
`remediation-backlog.md` ("Owner decisions, 2026-10-05"). In short:

- D1: all phases and enhancements are in scope; nothing is hidden or removed.
- D2: AR is in UAT scope.
- D4: the runner and two migrations are committed.
- UAT runs on the existing local instance only.
- Business data for UAT is entered by Playwright business-flow tests through the application.
- The never-built spec capabilities (BOM/production, projects, RMA, mobile) are wanted; they must be built first.

## 11. Metadata-proposal follow-up (2026-10-05)

The owner requested a deeper investigation of two pasted metadata/master-data proposals before deciding how to
proceed. The [follow-up report](metadata-proposals-investigation-2026-10-05.md) reviews the current checkout,
distinguishes U1's recorded deployment from uncommitted U2 work, carries forward every primary P0/P1 ID and records
additional dictionary/proposal gaps. It includes all 23 module directories, a phase/WI progress overlay, a master
data scorecard and repair dispositions that preserve existing assets. It does not upgrade a gate or authorize
product changes. The baseline counts above are not represented as a freshly reconciled remaining-defect count.
- The containment card R1 is withdrawn. The first card is U1 (`.pi/tasks/WI-OI-120a.md`).
- Still open: D5 (local proof-data clean-up), D6 (credential rotation) and D7 (named human reviewers).

The release verdict for production remains NO-GO; UAT readiness is the current goal.
