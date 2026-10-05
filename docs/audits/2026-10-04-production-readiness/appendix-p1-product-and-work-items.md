<!-- WI-OI-119 auditor working report, copied verbatim except for masked dev-default credentials. -->
> **Provenance.** Read-only auditor report produced for WI-OI-119 on 2026-10-04/05. It covers deliverables B (WI matrix), C (file-change inventory), status-drift register, CEO reviews, traceability.
> Findings marked CONFIRMED were reproduced by the auditor from code or commands; PLAUSIBLE ones were not. The primary
> agent re-checked every P0/P1 it relies on; that verification, and any severity changes, are in `README.md` and
> `.pi/work/WI-OI-119.md`, which take precedence over this appendix.

# WI-OI-119 — Auditor P1: Product / Work-Item / Status Truth

Scope: committed tree at HEAD `76b9452` (branch `feat/gigaops-convergence-core`) plus the one uncommitted WI-OI-119 registry row
(`.pi/WORK_ITEMS.md:146`). Untracked material is excluded from the candidate and flagged where committed code depends on it.
Method: read-only `git show/log/blame/ls-files`, `grep`, `sed`; no build, test, generator, docker or database command was run
(an attempt to run the manifest audit in its no-`--write` mode was refused by the permission layer and was not retried).
Evidence tags: **CONFIRMED** = reproduced here from repository objects; **PLAUSIBLE** = indirect, or supplied by the primary agent.
Release verdict: **NO-GO** (unchanged; nothing below supports an upgrade).

## 0. Summary counts

| Severity | Count | Meaning here |
| --- | ---: | --- |
| P0 | 2 | False G6 claim in the canonical registry; production candidate not reproducible from any commit (build + fresh install depend on untracked files) |
| P1 | 15 | False completion/approval claims, missing authority, missing independent review, broken HEAD runtime, owner-decision conflicts |
| P2 | 18 | Drift that misleads but does not authorize release |
| P3 | 9 | Hygiene |
| Status corrections proposed (downgrade/correct only) | 62 | Section 2 register, rows D-01…D-62 |
| WI rows assessed | 115 | 104 `WI-OI-*` + 6 `WI-WFO-*` + 5 `WI-EAM-*` |

Truthful gate distribution (my judgment): **G5 reached by 0 WIs; G6 by 0; G7 by 0.** Highest truthful gate anywhere is "G4-local"
(bounded Local Development implementation with exact-image evidence, no independent review, no PO acceptance).

### Top findings

| ID | Sev | Finding | Key evidence | Tag |
| --- | --- | --- | --- | --- |
| F-01 | P0 | Registry claims **"G0–G6 Proved"** for WI-OI-110 and WI-OI-111. G6 needs SBOM/provenance, immutable artifact and named human release authority (`docs/SDLC_DEVELOPMENT_GUIDE.md:70-75`). Neither item is deployed; their "certifications" are in-process library assertions with no DB/HTTP/browser (`scripts/verify-application-dictionary.mjs:1-4,34,54`; `scripts/verify-core-parties-and-custom-apps.mjs:1-4,40,82`). The Parties core migration was never executed in any recorded proof (`.pi/work/WI-OI-111.md:25` "prisma generate and packages/db tsc passing"). Text was written by the producer commits (`git log -S'G0–G6 Proved'` → 917141a, ad7f83b). | `.pi/WORK_ITEMS.md:132-133` | CONFIRMED |
| F-02 | P0 | **The committed candidate cannot build or fresh-install the control plane.** `infra/compose/docker/Dockerfile:26-27,171` (added in 2f18945) COPY/CMD `run-control-migrations.mjs` and `control-migration-policy.mjs`; `packages/db/package.json:24` and `packages/db-migrations-runtime/package.json:8` (changed in 007e686) call the same runner — all four referenced files are **untracked** (`git ls-files packages/db-migrations-runtime/` → only package.json, prisma.config.mjs). The fresh-install repair migrations `20260923590000_tp2_cancelled_enum_predecessor` and `20261002000000_database_extensions_foundation` are untracked (committed core migrations: 51; on disk: 53). Yet committed evidence says the fix is done: `.pi/work/WI-OI-109.md:297-318` ("source a2627d85…", "52 successful core migrations", "Policy tests pass 5/5" — the test file is untracked), `.pi/tasks/FOUNDATION-CLOSE.md:18` "fixed and proved", `.pi/tasks/WI-OI-109.md:85-86` `[x]`. Without the predecessor migration an empty database fails with 55P04 by the repo's own account (`.pi/work/WI-OI-109.md:299-301`). No commit can produce the evidenced image → G6 (immutable artifact, provenance) is impossible; fresh client install from the candidate is broken. | as cited | CONFIRMED |
| F-03 | P1 | **HEAD module host cannot start.** Finance code pins `SCHEMA_CONTRACT_VERSION = 7` (`modules/financial-operations/apps/api/src/config.ts:9`) and the SDK accepts only exactly that value (`packages/module-sdk/src/module-runtime-config.ts:43-48,115-120`), but `db/runtime-manifest.txt` stops at `000006` (lines 1-6; 10bbfba added `000007_…` without listing it) and the generated compose sets `FINANCIAL_OPERATIONS_EXPECTED_MIGRATION_VERSION: "6"` (`infra/compose/generated/compose.module-host.yaml:165`). The shared host (catalogue, inventory, orders, procurement, finance) would throw at config load. The Phase 14 schema can never be installed by the runtime, contradicting "Schema v7 applied" (`.pi/WORK_ITEMS.md:145`) and "complete" (`.pi/NOW.md:8`). | as cited | CONFIRMED (static) |
| F-04 | P1 | **Phases 4–14 contradict recorded owner decisions with no amendment.** Roadmap: "No general ledger in this programme… A GL is a separate Finance product only with named customer demand… and its own G0–G7" (`docs/plans/gigaops-convergence-roadmap.md:32`); ADR-0013 "Money: No general ledger" (`docs/architecture/ADR-0013-core-modules-and-solutions.md:75`); manufacturing plan (`docs/plans/manufacturing-package-solution-plan.md:75`); approved D7 freeze list "Accounts receivable, spend and AP, tax, multi-currency… CMMS purchase orders, vendors, IoT ingress… custom fields and catalogues" (`.pi/work/WI-OI-079.md:85-91,103`); finance roadmap "Bookmarked and deferred; no Build authorization" (`docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md:3`, committed 2026-10-03). Built anyway: WI-OI-094/095/114–118 (GL, treasury, FA, consolidation, costing, budgeting, close), 092 (procurement/AP), 093 (orders + AR billing), 113 (AR edits), 112 (catalogues), 110/111 (custom fields/apps), WI-EAM-004 (IoT), WI-EAM-005 (MRO storerooms), WI-WFO-003 (GL journal batches), WI-WFO-005 (vendor directory). The only authority is registry text "Approved by owner 2026-10-04" (`.pi/WORK_ITEMS.md:135-142`); 116–118 rows do not even say that. | as cited | CONFIRMED |
| F-05 | P1 | **Work-item IDs reused for different scope; Release 1 Wave-1 never registered.** The approved plan reserves WI-OI-093 = Inspections & Safety (permits/LOTO), 094 = Resource Planning board, 095 = Enterprise Asset Management, 086–090 = maintenance requests, PM automation, technician mobile, import kit, KPIs (`docs/plans/manufacturing-package-solution-plan.md:222-233`). 093/094/095 were reused for Orders, GL and Treasury; 086–090 are absent from the registry. Release 1 must-haves G-1/G-2 remain contained (`modules/physical-operations-cmms/module.yaml:32-38`), G-4 depends on WI-OI-084 which is Proposed/not started (`.pi/WORK_ITEMS.md:110`). | as cited | CONFIRMED |
| F-06 | P1 | **Duplicate authorities.** Core Prisma still holds `Supplier`, `PurchaseOrder(Line)`, `GoodsReceipt(Line)`, `SupplierInvoice(Line)`, `Invoice` (`packages/db/schema.prisma:1441,2051-2190`) while `universal-procurement` adds a second procurement store; CMMS still declares `parts-inventory`, `stock-ledger` (`modules/physical-operations-cmms/module.yaml:23-24`) while `universal-inventory` adds a second ledger. ADR-0013 required extraction/move instead (`ADR-0013…:69-70,112`). | as cited | CONFIRMED |
| F-07 | P1 | **No independent review on any deep-scope financial/migration/security change.** Evidence and ADRs authored by "Antigravity Pairing Assistant" (`.pi/work/WI-OI-110.md`…`094.md` Author lines); ADR-0020–0023, 0025, 0027–0032 self-marked "Accepted" in the same commit as the code, no named human decider (ADR-0020:5 lists "Security & Privacy" as a decider with no security review on record). No review package exists in `docs/reviews/` for WI-OI-080…118. Only owner in `.github/CODEOWNERS:1-2` ("Temporary… Add independent finance, security, data, and release teams before G4"). Violates `AGENTS.md:53-56`. | as cited | CONFIRMED |
| F-08 | P1 | ADR status misrepresented: registry "amended ADR-0024 via ADR-0026" and evidence "ADR-0026 approved" while both ADRs are **Proposed**. | `.pi/WORK_ITEMS.md:138`; `.pi/work/WI-OI-113.md:27`; `docs/architecture/ADR-0024-…:3`; `ADR-0026-…:3` | CONFIRMED |
| F-09 | P1 | **Frozen AR module modified and made mandatory.** e532d98 added `000014_ar_orders_inbox_receipts` and +325 lines to `invoices.service.ts`; `modules/financial-operations/module.yaml:12` requires `accounts-receivable`; WI-OI-019 row still "Blocked… Frozen… no review effort" (`.pi/WORK_ITEMS.md:27`). ADR-0026:87 says it "Requires bounded unfreezing"; no unfreeze record found. | `git show --stat e532d98 -- modules/accounts-receivable` | CONFIRMED |
| F-10 | P1 | **`pnpm verify` mutates the owner's database.** `scripts/verify.mjs:32-38` adds 7 finance proofs that default to `postgresql://gigalibs:<masked-dev-password>@localhost:5440/gigalibs` (e.g. `scripts/verify-period-close-and-forecasting.mjs:37`), the `gigalibs-postgres` instance whose "volume holds the owner's data" (`.pi/handoff/HANDOFF-2026-09-29.md:71,321`); they insert synthetic tenants with no cleanup (`finally { client.end() }`, :707), create a persistent `rls_test_user` role with `GRANT ALL` on `gigalibs_finance` (:667-671, one variant with password `<masked-dev-password>`), and require finance schema ≥7 (:85-91) — which no recorded runtime path can install (F-03) and no finance service is deployed (primary agent) ⇒ finance migrations were applied out of band to the owner's DB (the "D2 lesson", `.pi/NOW.md:67-68`). Violates `AGENTS.md:57-60`. | as cited | CONFIRMED (static); DB state PLAUSIBLE |
| F-11 | P1 | **Mislabeled commit carried unreviewed code and status flips.** 007e686 "docs(governance): record WI-OI-093 commit hash in NOW.md" changed kernel-worker `module-call.job.ts`, Connector Hub inbox, compose files (Workforce expected migration 18→19), migration-runner wiring in two package.json files, `schema.prisma`, `scripts/verify.mjs`, +276 lines of `scripts/verify-manufacturing-no-developer.mjs` (the "uncommitted Gemini corrections" NOW.md still says to preserve, `.pi/NOW.md:69-70`), and flipped WI-OI-109 to Review with `[x]` fresh-install checks. | `git show --stat 007e686` | CONFIRMED |
| F-12 | P1 | **Proofs bypass the product boundary; module tests absent.** Module proofs instantiate services directly (`new InventoryService(db)`, `universal-inventory/apps/api/scripts/real-database-proof.ts:100`; same for catalogue, procurement, orders); finance/convergence proofs are raw SQL; `scripts/verify-universal-{inventory,procurement,orders}.mjs` only check file existence/strings. `universal-inventory`, `universal-procurement`, `universal-orders` contain **zero** test files; `financial-operations` has 6 pure-engine tests and none for services, controllers, guards or signed context. No HTTP, BFF, browser or authorization-negative evidence for any phase module. | `git ls-files modules/<m> \| grep -E '\.(test\|spec)\.'` | CONFIRMED |
| F-13 | P1 | **Security-relevant cross-module edits inside unrelated WI commits.** 2f18945 (catalogue) changed the shared signed-context principal (`packages/module-sdk/src/signed-context.ts`) and the generator now gives `kernel-worker` every hosted module's `PLATFORM_CONTEXT_PRIVATE_KEY_BASE64` (`scripts/module-manifests.mjs`, +7 lines); a8207c4 (finance) changed CMMS `auth/authorization.ts` principal and Workforce expected migration version 19→25. None reviewed by Security. | `git show 2f18945 -- scripts/module-manifests.mjs packages/module-sdk`; `git show a8207c4 -- modules/physical-operations-cmms` | CONFIRMED (diff); impact PLAUSIBLE |
| F-14 | P1 | Accounting-standard and licensing claims with no qualified review: "Complete IFRS 10 / ASC 810 and IAS 21 group consolidation capability" (ADR-0029:193), "IAS 2 / ASC 330 compliant" (ADR-0030:12), ASC 606/IFRS 15 (WI-OI-118 card:47), "tamper-proof financial statement reporting" (ADR-0028:174). ADR-0025:57,73 "reconciles… Bigcapital's manual_journals / accounts_transactions" although the benchmark is AGPL-3.0 and "legal and OSS review is required before any reuse beyond independent behavioural analysis" (`deferred-finance-ops…:10-14`). | as cited | CONFIRMED (claims); contamination PLAUSIBLE |
| F-15 | P1 | WI-OI-008 claims "CI secret/SAST/dependency/container/IaC/SBOM/provenance gates pass"; the only workflow runs six static node scripts (`.github/workflows/repository-governance.yml:20-30`). | `.pi/WORK_ITEMS.md:16` | CONFIRMED |
| F-16 | P1 | **Lockfile out of sync at HEAD.** `apps/module-host/package.json:18` and `apps/workflow-platform/package.json:31` declare `@gigalibs/financial-operations-api/-web` (a8207c4) but the `apps/module-host` and `apps/workflow-platform` importers in `pnpm-lock.yaml` list only catalogue/inventory/orders/procurement — a frozen-lockfile install fails (NFR-OPS-002). `scripts/verify.mjs` sets `pnpm_config_verify_deps_before_run: 'false'` (007e686, e532d98), which hides this. | awk over `pnpm-lock.yaml` importers | CONFIRMED |
| F-17 | P1 | **Unrecorded deployment / false running-state.** NOW.md says every service runs `3da222030dc2-a0ca08f61655` (`.pi/NOW.md:10`); primary agent verified running image `007e686bebee-c1746f0b541b` (created 2026-10-04T07:06Z) that includes Phases 2–7 (catalogue, inventory, procurement, orders) — unreviewed modules deployed to the owner's environment with no NOW.md/registry record. | primary agent; `.pi/NOW.md:10` | PLAUSIBLE |


## 1. Deliverable B — WI matrix (all 115 registry rows)

Legend — truthful gate: **G4-local** = bounded Local Development build with exact-image/live evidence, unreviewed; **G4-partial** = code + unit/in-process or
throwaway-DB proof only, not deployed or not HTTP/E2E-proven; "stale" = later undeployed commits changed the module after its certification.
Verdicts: Ship / Conditional Ship / Return for Remediation (RfR) / Contain / Stop Investment / Frozen-no verdict change. No row is "Ship".
Common gaps not repeated per row: no named independent reviewer, no PO acceptance (G5), no SBOM/provenance/release authority (G6), no production observation (G7).

| WI | Area | Business outcome | Status | Gate claimed | Truthful gate | Key missing evidence | Verdict | Next remediation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WI-OI-001 | Governance R0 | Gap map, ADR, quarantine, audit baseline | Review | G0 | G0 (agent-produced) | Named Product/Arch/QA approval | RfR | Human approval or close as historical |
| WI-OI-002 | Old R1 AP slice | AP/integration/workflow/BFF/retention outcome | Review | G4–G5 | G4-local (historical; WI-OI-036 P0/P1 open) | Independent review; P0/P1 closure; AP is on D7 freeze list | Contain | Re-scope vs 2026-09-28 decision |
| WI-OI-003 | R1 verification | Assemble independent Release 1 verification | Review | G5 | ≤G4 — no named independent reviewer; targets superseded AP Release 1 | Named reviewers; PO acceptance; reproducible commit (F-02) | RfR | Rebuild package for manufacturing R1 at a reproducible commit |
| WI-OI-004 | Governance | Agent roster, baseline, tracker, WIP | Review | G1 | G1; audit:sdlc blind to WI-EAM rows and WIP never populated | Validator coverage (D-30); WIP enforcement | RfR | Fix scripts/verify-sdlc-governance.mjs:61 regex; populate WIP |
| WI-OI-005 | Security design | Threat model, permission matrix, data flow | Review | G2 | G2-draft; does not cover 9 new modules or kernel-worker key fan-out | Threat model for Phases 4–14, F-13 | RfR | Security update + independent review |
| WI-OI-006 | DR/migrations | Clean replay, backup/restore, roll-forward | Review | G2–G5 | G2/G4-partial; clean install from committed tree broken (F-02) | Reproducible clean replay from a commit; PITR/failover | RfR | Commit runner + predecessor migrations; re-prove |
| WI-OI-007 | Observability | Metrics, traces, alerts, SLOs | Review | G2–G5 | G4-partial | Traces/SLOs (NFR-OBS-003/004); nothing for new modules | RfR | SLO evidence per R1 module |
| WI-OI-008 | Supply chain | CI SAST/SBOM/provenance gates | Review | G5 | G2/G3 — CI runs 6 static scripts only (F-15) | SAST/SBOM/provenance/container scan in CI | RfR | Downgrade claim; add CI jobs |
| WI-OI-009 | UX/a11y | Role/state coverage, WCAG 2.2 AA | Review | G3–G5 | G4-partial (web E2E on old image 5abfa667bb10-e0819af5604c) | WCAG/usability on HEAD; NFR-UX-003 study | RfR | Re-run on reproducible image |
| WI-OI-010 | Performance | Load, noisy-neighbor, fault tests | Review | G5 | G4-partial (local laptop) | Production-like load (WI-OI-069 punch inbox marginal) | RfR | Representative load env |
| WI-OI-011 | Demo Lab FR-13 | Expiring isolated demo workspace | Review | G1–G5 | Contradictory: baseline FR-13 "Not implemented" (REQUIREMENTS_BASELINE.md:23); 064e built later | Reconciled evidence | Contain | Reconcile with WI-OI-064e |
| WI-OI-012 | Governed RAG FR-07 | Authorized retrieval with citations/abstention | Review | G1–G5 | ≤G3 (baseline FR-07 "governed RAG pending", :18) | Eval, AI governance review | Contain | Downgrade; AI review |
| WI-OI-013 | IAM / SSO FR-14 | Enterprise IdP/SCIM/SAML/WebAuthn, tenant recovery | Blocked | G1–G5 | G4-partial local; owner-declared No-Go | External IdP interop, DNS/TLS, PITR/failover, reviewers | RfR (release blocker) | Return to Build before any production release |
| WI-OI-014 | Action Gateway FR-09 | External action adapters + reconciliation | Review | G2–G5 | ≤G3 (baseline FR-09 "external adapters/reconciliation pending", :20) | Adapter evidence | Contain | Downgrade claim |
| WI-OI-015 | Usage/billing FR-16 | Meters, limits, caps, invoice reconciliation | Review | G1–G5 | ≤G2 (baseline FR-16 "Not implemented", :27) | Any implementation evidence accepted by baseline | Contain | Downgrade claim |
| WI-OI-016 | Outcome catalogue FR-01 | Versioned outcome packs per tenant | Review | G1–G5 | ≤G2 (baseline FR-01 "Designed; not implemented", :12) | Same | Contain | Downgrade claim |
| WI-OI-017 | Durable workflow FR-08 | Wait/parallel/resume/compensation | Review | G2–G5 | ≤G3 (baseline FR-08 "…compensation pending", :19); Workflow Studio frozen | Same | Contain | Downgrade claim |
| WI-OI-018 | Frozen 2026-09-28 | Two extra industry packs | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-020 | Frozen 2026-09-28 | Spend Management & AP Studio | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-021 | Frozen 2026-09-28 | Tax nexus engine | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-022 | Frozen 2026-09-28 | Multi-currency & treasury foundation | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-023 | Frozen 2026-09-28 | Universal Data Studio | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-024 | Frozen 2026-09-28 | Universal Rule Pro | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-025 | Frozen 2026-09-28 | Workflow Studio | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-027 | Frozen 2026-09-28 | Cash leakage & recovery studio | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-030 | Frozen 2026-09-28 | Infrastructure broker/provisioner | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-031 | Frozen 2026-09-28 | Solution packs hub | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-033 | Frozen 2026-09-28 | Day-1 client experience workbench | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-034 | Frozen 2026-09-28 | Rule engine kernel & studio | Blocked | G1–G5/G4 (historical) | Frozen; "verified live" text is historical claim (WORK_ITEMS.md:52-55) | — | Frozen-no verdict change | None until a client needs it |
| WI-OI-019 | AR (frozen, deep) | Customer invoicing & AR vertical (FR-17) | Blocked | G4 | Frozen; but modified by WI-OI-113 and now required by finance (F-09) | Formal unfreeze record or revert; Finance/Security review | Frozen-no verdict change (freeze breached) | Owner: unfreeze formally or revert e532d98 AR edits |
| WI-OI-026 | Connector Hub v1 | Vault, OAuth PKCE, sync, webhooks | Review | G4 | Superseded by WI-OI-059/104 | — | Contain | Close into WI-OI-104 |
| WI-OI-028 | Platform RBAC | Multi-tenant RBAC control panel (port 4300) | Review | G4 | None — platform-rbac retired (167323a, WI-OI-102g); dir now untracked | — | Stop Investment | Close as superseded |
| WI-OI-029 | Geospatial v1 | OSM studio | Review | G4 | Superseded by WI-OI-063/105 | — | Contain | Close into WI-OI-063 |
| WI-OI-032 | ERP OAuth studio | 1-click OAuth to commercial ERPs | Review | G4 | G4 claim historical (WORK_ITEMS.md:52-55); not R1 | — | Contain | Park |
| WI-OI-035 | AR invoicing (frozen, deep) | Multi-tier tax, hash-chained ledger, instalments | Blocked | G4 | Frozen; "Production-Grade" wording unsupported | — | Frozen-no verdict change | Remove "Production-Grade" wording |
| WI-OI-036 | Readiness audit | Independent baseline of defects | In Progress | G0 / G4–G5 audit | G0 audit; P0/P1 open | Closure of P0/P1 | Keep | Continue under WI-OI-119 |
| WI-OI-037 | Remediation plan | Audit-derived module plan | Review | G0–G3 plan | G0–G2 plan | Human review | RfR | Review or archive |
| WI-OI-038 | CMMS core (R1) | Work orders, PM, meters, parts for maintenance teams | Review | Bounded Local G4 | G4-local on 5abfa667bb10-7507432cb066; stale (CMMS migrations 000015–000019 by WI-EAM added after, not certified) | Re-cert at HEAD; G-1/G-2 must-haves still contained; reviewers; PO acceptance | RfR | Re-certify CMMS at a reproducible commit |
| WI-OI-039 | Config Studio (deep) | No-code forms/configuration core | Review | G3–G4 Build | G4-local; "acceptance" by one person as PO+SA+QA (not independent) | Independent Security/QA review | RfR | Independent review; drop "Production Alive" title |
| WI-OI-040 | Work-source billing (frozen, deep) | Event/supplemental billing (FR-17-EB) | Blocked | G0–G3 | Frozen at G0–G3 design | — | Frozen-no verdict change | None |
| WI-OI-041 | Release program | Value-first all-module release program | In Progress | G0–G1 program | G0–G1 | Alignment with 2026-09-28 decision | Keep | Re-baseline to manufacturing R1 |
| WI-OI-042 | Core schema fix | Department.updatedAt canonical correction | Review | Bounded Local G4 remediation | G4-local; named independent Backend/Data acceptance (Rakesh Konduri) | Remaining reviewers | Conditional Ship | Ships only with core once F-02 is fixed |
| WI-OI-043 | Analytics Studio | External data analytics & reports | Review | G4–G5 | G4-local; contained P0 replacements open | P0 replacements; review | RfR | Close P0s |
| WI-OI-044 | Delta-5 F1 design | Foundation governance/contracts | Review | G1–G3 | G1–G3 design | Specialist acceptance | RfR | Review |
| WI-OI-045 | Tenant Profile design | TP-1…TP-6 reference delta | Review | G3 | G3 | G3 acceptance | RfR | Review |
| WI-OI-046 | TP-1 | Tenant Profile adapter conformance | Review | G4 Review | G4-local exact-image (wi-oi-046-tp1) | Independent G4 review | RfR | Review |
| WI-OI-047 | Supply-chain local profile | Local profile hardening | Review | Local G4 remediation review | G4-local; Conditional Security decision (Harsha Koganti) | Credential rotation, licenses, SAST/IaC | RfR | Close conditions |
| WI-OI-048 | TP-2 | Durable tenant export + outbox | Review | G4 Review | G4-partial; its migration 20260924000000 breaks empty install (55P04); fix untracked | Commit predecessor migration; review | RfR | See F-02 |
| WI-OI-049 | Delta-5 foundation | TP-3 transactional inbox | Review | G4 Review | G4-partial (unit tests/harness) | Independent review; integration evidence | RfR | Review |
| WI-OI-050 | Delta-5 foundation | TP-4 admission/pools | Review | G4 Review | G4-partial (unit tests/harness) | Independent review; integration evidence | RfR | Review |
| WI-OI-051 | Delta-5 foundation | TP-5 audit sequencing/redaction | Review | G4 Review | G4-partial (unit tests/harness) | Independent review; integration evidence | RfR | Review |
| WI-OI-052 | Delta-5 foundation | TP-6 integrated certification | Review | G4 Review | G4-partial (unit tests/harness) | Independent review; integration evidence | RfR | Review |
| WI-OI-053 | Frozen 2026-09-28 | AR Delta-5 seals | Blocked | G4 Review | Frozen | — | Frozen-no verdict change | Fix governance notes (D-32) |
| WI-OI-055 | Frozen 2026-09-28 | Data Studio Delta-5 | Blocked | G4 Review | Frozen | — | Frozen-no verdict change | Fix governance notes (D-32) |
| WI-OI-056 | Frozen 2026-09-28 | Workflow Studio Delta-5 | Blocked | G4 Review | Frozen | — | Frozen-no verdict change | Fix governance notes (D-32) |
| WI-OI-057 | Frozen 2026-09-28 | Currency & tax Delta-5 | Blocked | G4 Review | Frozen | — | Frozen-no verdict change | Fix governance notes (D-32) |
| WI-OI-054 | Rule engine promotion | Unquarantine rule-engine-universal | Review | G4 Review | G4-partial (unit tests); "Rule Pro" is on D7 freeze list | Owner scope decision | Contain | Decide freeze status |
| WI-OI-058 | Web layout | Exact 5px gutter | Review | Bounded Local G4 | G4-local | Human visual acceptance | Conditional Ship | Visual sign-off |
| WI-OI-059 | Connector Hub + Analytics images | Hardened exact images, RLS | Review | Bounded Local G4 | G4-local exact image | Human review; Analytics completeness | RfR | Review |
| WI-OI-060 | Workforce runtime (R1) | Canonical Workforce foundation | Review | Bounded Local G4 | G4-local; stale (Workforce migrations 000020–000025 from WI-WFO added later) | SBOM license dispositions; review | RfR | Re-certify at HEAD |
| WI-OI-061 | Workforce admin (R1) | Tenant Admin workforce:*, TEAM lexicon | Review | Bounded Local G4 | G4-local; stale | Permission review; PO acceptance | RfR | Re-certify |
| WI-OI-062 | Convergence programme | P0–P11 sequence | Proposed | G0–G2 | G0–G2 | Owner confirmation | Keep | Reconcile with phases 2–14 |
| WI-OI-063 | Place/Geospatial (R1) | Sites, ltree places, spatial scope | Review | Bounded Local G4 | G4-local exact image 5abfa667bb10-e9aef742c13a | Independent review; PO | RfR | Review |
| WI-OI-064 | Configurability M1 | Fact store, packs, Demo Lab | Review | Bounded Local G4 | G4-local | Blind-industry PO acceptance | RfR | Run acceptance |
| WI-OI-065 | Workforce (R1) | Jobs, positions, engagements | Review | Bounded Local G4 | G4-local on 5abfa667bb10-* images; stale vs WFO migrations 20–25 | Re-cert at HEAD; review; PO acceptance | RfR | Re-certify |
| WI-OI-066 | Workforce (R1) | Availability, absences, calendars | Review | Bounded Local G4 | G4-local on 5abfa667bb10-* images; stale vs WFO migrations 20–25 | Re-cert at HEAD; review; PO acceptance | RfR | Re-certify |
| WI-OI-067 | Workforce (R1) | Demand & bookings | Review | Bounded Local G4 | G4-local on 5abfa667bb10-* images; stale vs WFO migrations 20–25 | Re-cert at HEAD; review; PO acceptance | RfR | Re-certify |
| WI-OI-068 | Workforce (R1) | CMMS↔Workforce handshake | Review | Bounded Local G4 | G4-local on 5abfa667bb10-* images; stale vs WFO migrations 20–25 | Re-cert at HEAD; review; PO acceptance | RfR | Re-certify |
| WI-OI-069 | Workforce (R1) | Time & attendance | Review | Bounded Local G4 | G4-local on 5abfa667bb10-* images; stale vs WFO migrations 20–25 | Re-cert at HEAD; review; PO acceptance | RfR | Re-certify |
| WI-OI-070 | Pay packs | Reference pay policy packs | Review | Bounded Local G4 slice | G4-local; reference packs not statutory; ADR-0008 Proposed; ADR-0012 missing | Jurisdiction decision; legal review | Contain | Local-only until statutory pack |
| WI-OI-071 | Pay export | Immutable payroll CSV export | Review | Bounded Local G4 slice | G4-local | Target system; Connector Hub delivery | RfR | Decide target |
| WI-OI-072 | Live intelligence P9 | Workforce/CMMS facts to analytics | Blocked | G0–G1 | G0–G1 | Owner decisions; UAT tenant | Keep blocked | Owner decisions |
| WI-OI-074 | Vocabulary | Industry term keys | Ready | G0–G2 | G0–G2; paused by owner (status should be Blocked) | — | Keep (paused) | Correct status (D-21) |
| WI-OI-079 | Manufacturing package | Release 1 definition | Proposed | G0; G1 draft | G0 (D1–D6 open) | Owner decisions D1–D6 | Keep | This is the R1 authority; enforce it |
| WI-OI-080 | Wave0 C1 (deep) | Layer/ownership audit, ADR-0013 | Review | G4 complete; G5 pending | G4-local tooling; ADR-0013 Proposed and now contradicted by phases 5–14 | ADR-0013 independent review/reconciliation | RfR | Reconcile ADR-0013 with F-04/F-06 |
| WI-OI-081 | Wave0 C2 (deep) | module.yaml v1 + generated catalogue | Review | G4–G5 evidence recorded | G4-local; manifest audit missed generated drift at e532d98 and runtime-manifest/contract mismatch (F-03) | Completeness checks (all migrations listed; contract = manifest) | RfR | Add checks; remove "G5" |
| WI-OI-082 | Wave0 C3 (deep) | Module SDK; CMMS/Workforce adoption | Review | G4–G5 evidence recorded | G4-local (12/12 on 103da75e470e-f01b896910a9); SDK signed-context changed later in 2f18945 without re-cert | Security review; re-cert | RfR | Re-certify SDK |
| WI-OI-083 | Wave0 C4 (deep) | Manifest-driven web extension points | Review | G0–G3; G4 local | G4-local | Security review of [gateway] root (row text) | RfR | Security review |
| WI-OI-084 | Wave0 C5 (deep) | Mobile shell + offline sync | Proposed | G0 | G0; ADR-0014 does not exist | Everything; R1 must-have G-4 depends on it | RfR (R1 blocker, not started) | Prioritise over Phases 4–14 |
| WI-OI-085 | Wave0 C9 (deep) | module:new generator + conformance | Review | G0–G4 | G4-local tooling | QA/Docs decisions | Conditional Ship (internal tooling) | Review |
| WI-OI-101 | Local tooling | Docker disk guard | Review | G4 local tooling | G4-local tooling | Review | Conditional Ship (internal tooling) | Review |
| WI-OI-102 | Foundation boundaries | ADR-0016 F1–F17 kernel/capability split | Review | G0–G4 | G4-local; ADR-0016 Proposed | Independent review | RfR | Review |
| WI-OI-103 | Analytics engine | Query contract, measures, dashboards | Review | G0–G4 | G4-local partial; 103f deferred; card "In progress" | 103f proof | RfR | Finish 103f |
| WI-OI-104 | Integration foundation | Adapter framework, kernel jobs | Review | G0–G3; 104a in progress | G4-local partial; status contradictory (card Planned, note In Progress) | Consistent status; review | RfR | Correct status (D-23) |
| WI-OI-105 | Places | Boundaries, place tagging, scope | Review | G0–G3 + live | G4-local (042d22787b32-d3e901751025) | Review | RfR | Review |
| WI-OI-106 | Reports v2 | PDF/Excel from saved views | Review | G0–G3 + throwaway proof | G4-partial; row says 000026 deployment pending but NOW.md says Analytics 29 live | Live browser proof | RfR | Correct row (D-24) |
| WI-OI-107 | Industry packs | Solution-layer packs | Review | G0–G3 + live | G4-local (2a48e326e327-93674f4f9ea2) | Review | RfR | Review |
| WI-OI-108 | Forms rebuild | Rebuild contained forms work | Proposed | G0 | G0 | — | Keep | — |
| WI-OI-109 | Phase 1 Org hierarchy (deep) | Governed org units/trees and server-resolved scope | Review | G0–G4 deployed on 3da2220 | G4-local deployed; fresh-install closure NOT in candidate (F-02) | Commit runner + migrations; live E2E/a11y; Security/IAM review | RfR | Commit and re-prove from a clean checkout |
| WI-WFO-001 | Workforce expansion | Universal worker registry + engagements | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | RfR | Re-register under WI-OI; live proof |
| WI-WFO-002 | Workforce expansion | Bulk invitations, contracts, e-signature | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | RfR | Re-register under WI-OI; live proof |
| WI-WFO-003 | Workforce expansion | Payroll admin, expenses, ERP GL journal batches | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | Contain (freeze-list conflict) | Re-register under WI-OI; live proof |
| WI-WFO-004 | Workforce expansion | Demand forecast, open shifts, swaps | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | RfR | Re-register under WI-OI; live proof |
| WI-WFO-005 | Workforce expansion | Compliance queue, broadcasts, vendor directory | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | Contain (freeze-list conflict) | Re-register under WI-OI; live proof |
| WI-WFO-006 | Workforce expansion | Industry packs, 7 reports, 21-stage proof | Review | (none — gate cell holds evidence text) | G4-partial; not certified live ("Pending live container proof"); non-WI-OI ID | Live proof; review; PO; WI-OI ID | RfR | Re-register under WI-OI; live proof |
| WI-EAM-001 | CMMS expansion | Spatial topology, CAFM, CAD/BIM anchors | In Review (invalid) | G0–G4 Complete | G4-partial; not deployed; CMMS manifest still lists iot-ingress/automatic-pm contained | Valid status; live proof; review; WI-OI ID | RfR | Correct status; re-register |
| WI-EAM-002 | CMMS expansion | Asset taxonomy, specs, status cascade | In Review (invalid) | G0–G4 Complete | G4-partial; not deployed; CMMS manifest still lists iot-ingress/automatic-pm contained | Valid status; live proof; review; WI-OI ID | RfR | Correct status; re-register |
| WI-EAM-003 | CMMS expansion | Manuals, SOPs, failure hierarchy | In Review (invalid) | G0–G3 Active | G4-partial; not deployed; CMMS manifest still lists iot-ingress/automatic-pm contained | Valid status; live proof; review; WI-OI ID | RfR | Correct status; re-register |
| WI-EAM-004 | CMMS expansion | Telemetry ingestion, meter-driven PM triggers | In Review (invalid) | G0–G3 Active | G4-partial; not deployed; CMMS manifest still lists iot-ingress/automatic-pm contained | Valid status; live proof; review; WI-OI ID | Contain (freeze-list conflict: IoT ingress / CMMS POs-vendors) | Correct status; re-register |
| WI-EAM-005 | CMMS expansion | MRO storerooms, workforce relay, TCO | In Review (invalid) | G4 Under Review | G4-partial; not deployed; CMMS manifest still lists iot-ingress/automatic-pm contained | Valid status; live proof; review; WI-OI ID | Contain (freeze-list conflict: IoT ingress / CMMS POs-vendors) | Correct status; re-register |
| WI-OI-110 | Phase 2 App Dictionary (deep) | Metadata-driven entities/fields/layouts/rules | Review | G0–G6 Proved | G3 / G4-partial (library + unit + in-process script; not deployed) | Remove G6; DB/HTTP/UI proof; Security review of Safe-AST evaluator; ADR-0019 acceptance | RfR | Downgrade (D-01) |
| WI-OI-111 | Phase 3 Parties (deep) | Canonical customer/supplier/person master | Review | G0–G6 Proved | G3 / G4-partial (core migration never executed in evidence; not deployed) | Migration replay + RLS negatives; privacy review | RfR | Downgrade (D-02) |
| WI-OI-112 | Phase 4 Catalogue (deep) | Products, UOM, price lists | Review | Active | G4-partial (throwaway-PG service proof 8/8; no HTTP/authz) | Freeze-list "catalogues"; owner scope decision | Contain | Owner decision |
| WI-OI-091 | Phase 5 Inventory (deep) | Stock ledger, locations, lots, reservations | Review | Active | G4-partial; 0 module tests; duplicate of CMMS stock ledger | Tests; dedupe per ADR-0013:69 | Contain | Owner decision; extraction plan |
| WI-OI-092 | Phase 6 Procurement (deep) | Requisitions, POs, 3-way match, AP bills | Review | Active | G4-partial; 0 module tests; duplicate of core procurement models | AP on freeze list; C7 move | Contain | Owner decision |
| WI-OI-093 | Phase 7 Orders (deep) | Quotes, SOs, ATP, fulfilment | Review | Active | G4-partial; 0 module tests; ADR-0024 Proposed; ID reserved for Inspections & Safety | Re-ID; ADR acceptance | Contain | Re-ID; owner decision |
| WI-OI-113 | Convergence (deep) | Outbox/inbox relays across inventory/procurement/orders/AR | Review | Active | G4-partial; proof against owner DB; frozen AR edited; ADR-0026 Proposed; generated drift at commit | AR unfreeze record; ADR acceptance; Finance/Security review | RfR / Contain | Revert or formally unfreeze AR |
| WI-OI-094 | Finance (deep) | Phase 8 GL: books, CoA, periods, journals, statements | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed; ID reserved for Resource Planning board | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-095 | Finance (deep) | Phase 9 Treasury: bank accounts, statements, reconciliation | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed; ID reserved for EAM | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-114 | Finance (deep) | Phase 10 Fixed assets & depreciation | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-115 | Finance (deep) | Phase 11 Consolidation & eliminations (FX translation) | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-116 | Finance (deep) | Phase 12 Costing, landed cost, COGS | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-117 | Finance (deep) | Phase 13 Budgeting & commitment control | Review | Active | G4-partial: raw-SQL proofs vs owner DB; no service/controller/authz tests; not deployed | Owner amendment of "no GL"; accountant review; named Finance reviewer | Stop Investment + Contain | Freeze; reopen only with named customer + own G0–G7 |
| WI-OI-118 | Phase 14 Close & forecast (deep) | Subledger locks, accruals, year-end, forecasts | Review (card: Done) | Active | <G4-partial: migration 000007 not in runtime manifest → host startup failure (F-03) | Same as finance + fix manifest | Stop Investment + Contain | Fix F-03 only to unbreak HEAD; freeze |
| WI-OI-119 | This audit | Production-readiness audit | In Progress | G0–G1 audit | G0–G1 | — | Keep | Deliver |

_Row count check: 115 rows._

## 2. Status-drift register (downgrade/correct only — 62 proposed corrections)

| # | Location | Current text | Contradiction / evidence | Proposed corrected text | Sev |
| --- | --- | --- | --- | --- | --- |
| D-01 | .pi/WORK_ITEMS.md:132 (WI-OI-110) | Gate "G0–G6 Proved"; "certified with scripts/verify-application-dictionary.mjs" | G6 needs SBOM/provenance + named release authority; not deployed; script is in-process library asserts | Gate: "G0–G3 recorded; G4 partial (library/unit/in-process script only; not deployed). No G5/G6." | P0 |
| D-02 | .pi/WORK_ITEMS.md:133 (WI-OI-111) | Gate "G0–G6 Proved"; "certified with scripts/verify-core-parties-and-custom-apps.mjs" | Same; core migration 20261003000000 never executed in recorded evidence (.pi/work/WI-OI-111.md:25) | Gate: "G0–G3 recorded; G4 partial (migration authored, not executed in any recorded proof; not deployed). No G5/G6." | P0 |
| D-03 | .pi/WORK_ITEMS.md:120 (WI-OI-109) | "verified and deployed … full pnpm verify passes" | Fresh-install closure relies on untracked runner + migrations (F-02) | Append: "Fresh-install/upgrade closure is not in the committed tree; not reproducible from any commit." | P0 |
| D-04 | .pi/tasks/FOUNDATION-CLOSE.md:18 | "Fresh install — fixed and proved 2026-10-02" | Fix lives only in untracked files | "Fresh install — fix prepared but uncommitted (untracked runner + 2 migrations); not proved from a commit." | P0 |
| D-05 | .pi/tasks/WI-OI-109.md:85-86 | "[x] Fresh installation… pass", "[x] pnpm verify passes" | Same; "Policy tests pass 5/5" test file untracked | Revert to "[ ] … pending commit and clean-checkout re-proof". | P0 |
| D-06 | .pi/WORK_ITEMS.md:134-145 (12 rows) | Gate "Active" | Not a gate; implies authority | Per row: "G4 partial (local, unreviewed, not deployed)"; WI-OI-118: "below G4 — runtime manifest omits 000007". | P2 |
| D-07 | .pi/WORK_ITEMS.md:135-142 | "Approved by owner 2026-10-04 … passing N/N real-database proof/certification" | Conflicts with roadmap §2 "No general ledger", ADR-0013:75, WI-OI-079 D7 freeze list; proofs are service-level or raw SQL | Append: "Scope conflicts with the 2026-09-28 owner decision; no amendment recorded. Proofs are service-level/raw SQL, not HTTP/E2E." | P1 |
| D-08 | .pi/WORK_ITEMS.md:138 (WI-OI-113) | "amended ADR-0024 via ADR-0026; unfroze bounded AR inbox work" | ADR-0024:3 and ADR-0026:3 are Proposed; WI-OI-019 still frozen (:27) | "Proposed ADR-0026 would amend ADR-0024 (both Proposed). Frozen AR module edited without a recorded unfreeze." | P1 |
| D-09 | .pi/WORK_ITEMS.md:143-145 | "ADR-0030/0031/0032 accepted" | Producer self-acceptance; no named decider | "ADR-0030/0031/0032 marked Accepted by the producer; no human or independent acceptance recorded." | P1 |
| D-10 | .pi/WORK_ITEMS.md:145 (WI-OI-118) | "Schema v7 applied… All 18 verification steps… pass cleanly" | runtime-manifest.txt stops at 000006; compose expects 6, code 7 (F-03); proofs ran on owner DB | "Migration 000007 authored but not in the runtime manifest; HEAD host start fails; proofs ran against the owner's local DB." | P1 |
| D-11 | .pi/WORK_ITEMS.md:16 (WI-OI-008) | "CI secret/SAST/dependency/container/IaC/SBOM/provenance gates pass" | .github/workflows/repository-governance.yml:20-30 runs six static scripts | "Local scripts only; CI has no SAST/SBOM/provenance/container scan." Gate → G3. | P1 |
| D-12 | .pi/WORK_ITEMS.md:11 (WI-OI-003) | Gate "G5"; "Assembled independent Release 1 verification" | No named independent reviewers; Release 1 redefined 2026-09-28 | Gate "G4"; "package for superseded AP Release 1; no named reviewers". | P2 |
| D-13 | .pi/WORK_ITEMS.md:107-108 (WI-OI-081/082) | Gate "G4–G5 evidence recorded" | G5 needs independent review + PO acceptance | "G4 local evidence; G5 not started." | P2 |
| D-14 | .pi/WORK_ITEMS.md:19 (WI-OI-011) | G1–G5 Demo Lab evidence | docs/REQUIREMENTS_BASELINE.md:23 FR-13 "Not implemented" | Append "unreconciled with baseline FR-13". | P2 |
| D-15 | .pi/WORK_ITEMS.md:20 (WI-OI-012) | G1–G5 governed RAG | Baseline :18 "governed RAG pending" | Gate "≤G3; unreconciled with baseline FR-07". | P2 |
| D-16 | .pi/WORK_ITEMS.md:22 (WI-OI-014) | External action adapters + reconciliation | Baseline :20 "external adapters/reconciliation pending" | Gate "≤G3; unreconciled with FR-09". | P2 |
| D-17 | .pi/WORK_ITEMS.md:23 (WI-OI-015) | Usage meters…invoice reconciliation | Baseline :27 FR-16 "Not implemented" | Gate "≤G2; unreconciled with FR-16". | P2 |
| D-18 | .pi/WORK_ITEMS.md:24 (WI-OI-016) | Persisted outcome catalogue | Baseline :12 FR-01 "Designed; not implemented" | Gate "≤G2; unreconciled with FR-01". | P2 |
| D-19 | .pi/WORK_ITEMS.md:25 (WI-OI-017) | Wait/parallel/resume/compensation | Baseline :19 "…compensation pending" | Gate "≤G3; unreconciled with FR-08". | P2 |
| D-20 | .pi/WORK_ITEMS.md:36 (WI-OI-028) | "Real Multi-Tenant RBAC… Port 4300 daemon" | platform-rbac retired in 167323a (WI-OI-102g); directory untracked | "Superseded by WI-OI-102g; close." | P2 |
| D-21 | .pi/WORK_ITEMS.md:104 (WI-OI-074) | Status "Ready" | Row says paused by owner 2026-09-28 | Status "Blocked (paused by owner)". | P2 |
| D-22 | .pi/WORK_ITEMS.md:114 (WI-OI-103) | "two uncommitted proof corrections are preserved and excluded" | Committed in 007e686 | "…were committed in 007e686 (WI-OI-093 docs commit) without review." | P2 |
| D-23 | .pi/WORK_ITEMS.md:115 (WI-OI-104) | Status Review | Card .pi/tasks/WI-OI-104.md:3 "Planned"; config/sdlc-governance.json:79 "In Progress" | Owner to pick one; note "card/governance disagree". | P2 |
| D-24 | .pi/WORK_ITEMS.md:117 (WI-OI-106) | "pending owner approval for live migration 000026 deployment" | .pi/NOW.md:11 Analytics 29 live | "000026 is live; live browser proof pending". | P3 |
| D-25 | .pi/WORK_ITEMS.md:121-126 (WI-WFO-*) | Gate cell holds evidence text; IDs not WI-OI | AGENTS.md:47 requires WI-OI-NNN; no gate | Gate "G4 partial (pnpm verify only; live proof pending; not deployed)"; re-register under WI-OI. | P2 |
| D-26 | .pi/WORK_ITEMS.md:121-122 (WI-WFO-001/002) | Status Review | Cards .pi/tasks/WI-WFO-001.md:3, 002.md:3 "In progress"; "Pending live container proof" | Status "In Progress". | P2 |
| D-27 | .pi/WORK_ITEMS.md:127-131 (WI-EAM-*) | Status "In Review"; gates "G0–G4 Complete"/"G0–G3 Active"/"G4 Under Review" | Invalid status value (WORK_ITEMS.md:4); not validated (D-30) | Status "Review"; gate "G4 partial (not deployed; unreviewed)". | P2 |
| D-28 | .pi/WORK_ITEMS.md:129-130 (WI-EAM-003/004) | "Implementation complete, awaiting commit" | Committed c4ddefe / 36f41aa | "Committed c4ddefe/36f41aa; not deployed". | P3 |
| D-29 | .pi/WORK_ITEMS.md:130 (WI-EAM-004) | "…auto-firing high-priority Work Orders" | modules/physical-operations-cmms/module.yaml:32-38 still contains iot-ingress, automatic-pm-generation | "Not enabled; capabilities remain contained in the CMMS manifest". | P2 |
| D-30 | scripts/verify-sdlc-governance.mjs:61 | Row regex `WI-OI-\d{3}|WI-WFO-\d{3}` (widened in 94fae89) | WI-EAM rows (invalid status) silently skipped; audit:sdlc "passes" | Validate every `| WI-` row; reject non-WI-OI IDs. | P2 |
| D-31 | config/sdlc-governance.json:39-41 | implementationModules 1; activeImplementationWorkItems [] ; note lists 14 commits | Empty at 917141a, 2f18945, 2890f10, a8207c4, 10bbfba (git show <sha>:config/sdlc-governance.json) | Note: "WIP limit not exercised during 2026-10-03/04 builds." | P2 |
| D-32 | config/sdlc-governance.json:56-60 | note_WI-OI-053/055/056/057 "Review: … complete" | Registry rows 84,86-88 Blocked (frozen) | "Blocked (frozen 2026-09-28); prior Review text historical." | P2 |
| D-33 | config/sdlc-governance.json:79 | note_WI-OI-104 "In Progress" | Registry :115 Review | Align to canonical registry. | P2 |
| D-34 | .pi/NOW.md:8 | "Phase 14 … complete. All 18 verification steps in pnpm verify pass cleanly" | Review; not deployed; F-03; steps depend on owner DB | "WI-OI-118 committed 10bbfba, in Review; not deployed; HEAD host start broken (F-03)." | P1 |
| D-35 | .pi/NOW.md:10-14 | "every application service is on 3da222030dc2-a0ca08f61655" | Primary agent: running image 007e686bebee-c1746f0b541b incl. Phases 2–7 | "Running 007e686bebee-c1746f0b541b (unrecorded deploy incl. Phases 2–7); e532d98…10bbfba not deployed; HEAD not deployable." | P1 |
| D-36 | .pi/NOW.md:46-57 | Open decisions omit scope conflict | Phases 4–14 vs 2026-09-28 decision | Add: "Owner must reconcile Phases 4–14 with roadmap §2 and D7 freeze list." | P1 |
| D-37 | .pi/NOW.md:69-70 | "Preserve the uncommitted Gemini corrections…" | Committed in 007e686 | "Committed in 007e686; treat as unreviewed." | P2 |
| D-38 | .pi/PLAN.md:22-28 | "Current gate… Release 1 AP reference outcome" | Release 1 redefined 2026-09-28 (roadmap :37-44) | "Release 1 = core + CMMS + Workforce + Geospatial + manufacturing pack; no R1 item has passed G5." | P2 |
| D-39 | .pi/PLAN.md:74 | "adds no general ledger" | Contradicted by WI-OI-094/095/114–118 | Append "contradicted by GL builds of 2026-10-04 without amendment". | P2 |
| D-40 | .pi/tasks/WI-OI-111.md:3 | "Complete (Awaiting owner commit)" | Committed ad7f83b; registry Review | "Review (committed ad7f83b; not deployed; unreviewed)". | P2 |
| D-41 | .pi/tasks/WI-OI-093.md:3 | "Completed (Owner commit pending)" | Committed 5d1aa3a | "Review (committed 5d1aa3a)". | P2 |
| D-42 | .pi/tasks/WI-OI-113.md:3 | "In progress (… awaiting owner commit)" | Committed e532d98 | "Review (committed e532d98)". | P2 |
| D-43 | .pi/tasks/WI-OI-118.md:3 | "Done (2026-10-04)" | Registry Review; F-03 | "Review (committed 10bbfba; migration 000007 not in runtime manifest)". | P1 |
| D-44 | .pi/tasks/WI-OI-110.md:3 and .pi/work/WI-OI-110.md:5 | "In Review (implementation complete, all audits and certifications pass)" | In-process certification only | "Review (local implementation; in-process proof only; not deployed)". | P2 |
| D-45 | .pi/tasks/WI-OI-091.md:3; .pi/work/WI-OI-091.md:5 | "Complete / In Review (certified 2026-10-04)" | Service-level throwaway-DB proof; 0 module tests | "Review (not certified)". | P2 |
| D-46 | .pi/tasks/WI-OI-092.md:3; .pi/work/WI-OI-092.md:5 | "Complete (… certified with real database proof…)" | Same | "Review (not certified)". | P2 |
| D-47 | .pi/work/WI-OI-093.md:5; .pi/work/WI-OI-095.md:4 | "Complete / Verification Passed (Pending Owner Commit)"; "Complete / Ready for Review" | Committed; unreviewed | "Review". | P3 |
| D-48 | .pi/tasks/WI-OI-112.md:3; .pi/work/WI-OI-112.md:5; .pi/tasks/WI-OI-095.md:3 | "Ready for Review"; "In Progress (owner approved)"; "Approved | Review" | Non-standard values (WORK_ITEMS.md:4) | "Review". | P3 |
| D-49 | .pi/work/WI-OI-113.md:5,27 | "Real Database Certification Complete"; "ADR-0026 approved" | ADR-0026:3 Proposed | "Review; ADR-0026 Proposed". | P1 |
| D-50 | .pi/tasks/WI-OI-103.md:3; .pi/tasks/WI-OI-104.md:3 | "In progress"; "Planned 2026-09-30" | Registry Review | Registry to record "103a–e Review; 103f not started"; 104 per D-23. | P3 |
| D-51 | .pi/tasks/WI-EAM-001.md:3, -002.md:3, -003.md:3, -004.md:3, -005.md:3 | "IN_REVIEW"; "Complete…"; "Complete (… awaiting commit)"; "Complete (verified…)" | Non-standard; committed; not deployed | "Review (not deployed, unreviewed)". | P3 |
| D-52 | .pi/work/WI-OI-080.md:3, 081.md:3, 082.md:3 | "In Progress (sole active item from 2026-09-28)" | Registry Review | "Review". | P3 |
| D-53 | .pi/work/WI-OI-013.md:3 | "Status: In Progress" | Registry :21 Blocked / No-Go | "Blocked (No-Go)". | P2 |
| D-54 | .pi/work/WI-OI-019.md:3; 035.md:4; 040.md:3 | "Review"; "Review"; "Proposed" | Registry Blocked (frozen 2026-09-28) | "Blocked (frozen 2026-09-28)". | P2 |
| D-55 | docs/architecture/ADR-0019…:3; ADR-0020…0023:3; ADR-0025:3; ADR-0027…0032:3 | "Accepted" / "Accepted for Implementation" | Producer-authored same commit as code; no named human; ADR-0020:5 lists Security as decider without a review | "Proposed (owner/independent acceptance not recorded)". | P1 |
| D-56 | ADR-0029:193; ADR-0030:12; ADR-0028:174; ADR-0027:145; ADR-0025:33; .pi/work/WI-OI-094.md:97 | "Complete IFRS 10/ASC 810 and IAS 21…"; "IAS 2/ASC 330 compliant"; "tamper-proof"; "hardware-enforced Row-Level Security" | No accountant/legal review; RLS is software | "Designed with reference to IAS 21/IFRS 10 concepts; not reviewed by a qualified accountant"; "PostgreSQL RLS". | P1 |
| D-57 | .pi/work/WI-OI-110.md:13; .pi/work/WI-OI-113.md:13; .pi/tasks/WI-OI-113.md:5,23; ADR-0019:13 | "production-grade"; "production-ready slices" | docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md:35 | Remove. | P2 |
| D-58 | modules/financial-operations/module.yaml:8,12 | workItem WI-OI-094; requiredModules includes accounts-receivable | Capabilities span WI-OI-095/114–118; AR frozen | "workItem: WI-OI-094 (+095, 114–118)"; flag frozen dependency. | P2 |
| D-59 | modules/physical-operations-cmms/module.yaml:9; modules/gigaops/module.yaml:9; modules/accounts-receivable/module.yaml:8 | workItem WI-OI-038 / WI-OI-060 / WI-OI-019 | Changed by WI-EAM-001..005 / WI-WFO-001..006 / WI-OI-113 | List contributing WIs. | P3 |
| D-60 | docs/reviews/UNIVERSAL_UI_CONFIGURATION_STUDIO_SPECIALIST_REVIEW_ACCEPTANCE.md:1,4-5 | "Production Alive Confirmation"; one reviewer as PO + SA + QA Lead | Not independent (NFR-GOV-002); local profile only | "Local Development owner confirmation (not an independent review)". | P2 |
| D-61 | .pi/WORK_ITEMS.md:43 (WI-OI-035) | "Production-Grade Invoicing & AR Subsystem…" | Historical, unverified (WORK_ITEMS.md:52-55) | Prefix "Claimed (historical, unverified):". | P3 |
| D-62 | .pi/WORK_ITEMS.md:121-145 table shape | 8 cells per row in a 7-column table; WI-OI-109 gate cell holds evidence | Renders wrong; validator reads wrong cells | Move descriptions into the evidence cell. | P3 |

## 3. Deliverable C — file-change inventory of the 14 phase commits

Source: `git show --name-status --format= <sha>` and `git show --shortstat`. Category rules: generated = files whose header says
"Generated by/Do not edit" (detected by `head -5 | grep -i 'generated by|do not edit'`) plus `infra/compose/generated/modules.json`;
manifest/config = module.yaml, runtime-manifest.txt, package.json, lockfile, tsconfig, `config/`, `infra/` (non-generated).
All 14 commits are authored "Chinni" and dated 2026-10-03/04; none is deployed except possibly Phases 2–7 inside the unrecorded image
`007e686bebee-c1746f0b541b` (primary agent, F-17).

| Commit | WI | Phase | Files | migration | API/shared source | web/UI source | test | generated | manifest/config | docs/governance | scripts/proof | other | Lines |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 917141a | WI-OI-110 | P2 App Dictionary | 22 | 0 | 8 | 4 | 4 | 0 | 0 | 5 | 1 | 0 | +4116/-11 |
| ad7f83b | WI-OI-111 | P3 Parties | 27 | 2 | 10 | 3 | 5 | 0 | 1 | 5 | 1 | 0 | +5191/-6 |
| 2f18945 | WI-OI-112 | P4 Catalogue | 55 | 1 | 17 | 2 | 3 | 9 | 10 | 9 | 4 | 0 | +7563/-14 |
| 2890f10 | WI-OI-091 | P5 Inventory | 43 | 1 | 15 | 2 | 0 | 9 | 8 | 5 | 3 | 0 | +5806/-4 |
| 155061d | WI-OI-092 | P6 Procurement | 48 | 1 | 17 | 2 | 2 | 9 | 8 | 6 | 3 | 0 | +5915/-290 |
| 5d1aa3a | WI-OI-093 | P7 Orders | 48 | 1 | 15 | 4 | 2 | 9 | 8 | 6 | 3 | 0 | +5110/-46 |
| e532d98 | WI-OI-113 | Convergence | 52 | 5 | 19 | 3 | 4 | 0 | 7 | 9 | 5 | 0 | +3585/-220 |
| a8207c4 | WI-OI-094 | P8 GL | 54 | 1 | 16 | 3 | 4 | 9 | 13 | 5 | 3 | 0 | +5639/-70 |
| b799abd | WI-OI-095 | P9 Treasury | 25 | 1 | 8 | 1 | 2 | 3 | 3 | 5 | 2 | 0 | +3671/-66 |
| eb7391a | WI-OI-114 | P10 Fixed assets | 25 | 1 | 8 | 1 | 2 | 3 | 3 | 5 | 2 | 0 | +3317/-16 |
| 51c9ad8 | WI-OI-115 | P11 Consolidation | 25 | 1 | 8 | 1 | 2 | 3 | 3 | 5 | 2 | 0 | +3483/-10 |
| babd0b9 | WI-OI-116 | P12 Costing | 26 | 1 | 8 | 1 | 2 | 3 | 3 | 5 | 3 | 0 | +3441/-10 |
| d731c05 | WI-OI-117 | P13 Budgeting | 25 | 1 | 8 | 1 | 2 | 3 | 3 | 5 | 2 | 0 | +3777/-8 |
| 10bbfba | WI-OI-118 | P14 Close | 22 | 1 | 8 | 1 | 2 | 1 | 2 | 5 | 2 | 0 | +4555/-5 |
| **Total** | | | **497** | **18** | **165** | **29** | **36** | **61** | **72** | **80** | **36** | **0** | |

Test column note: most "test" files are contract-schema tests (`packages/contracts/src/*/*.test.ts`) or registry/equivalence specs.
Module-level tests: universal-inventory 0, universal-procurement 0, universal-orders 0, product-catalogue 1, financial-operations 6
(pure engines only: depreciation, FX translation, costing, budgeting, close, statement parsers). No controller, guard, BFF or
signed-context test exists for any phase module (CONFIRMED, `git ls-files modules/<m> | grep -E '\.(test|spec)\.tsx?$'`).

### 3.1 Notable files per commit

| Commit | Notable files / observations |
| --- | --- |
| 917141a (110) | `packages/configuration-core/src/dictionary-compiler.ts`, `dictionary-evaluator.ts` (Safe-AST evaluator — security-relevant), `ApplicationDictionaryWorkbench.tsx`, `DictionaryRenderer.tsx`, ADR-0019 (self-"Accepted for Implementation"), `scripts/verify-application-dictionary.mjs` (in-process asserts on `dist/`). No migration (reuses ConfigurationChangeSet JSONB). |
| ad7f83b (111) | Core migration `packages/db/migrations/20261003000000_core_parties_foundation/migration.sql` + `schema.prisma` (9 Party models) — **no execution evidence**; `apps/workflow-platform/app/api/control/[...path]/route.ts` (BFF route — security-relevant); `config/package-layers.json`; ADR-0020 (self-"Accepted", lists Security as decider). Privacy inventory entries for Party only added later in e532d98. |
| 2f18945 (112) | New `modules/product-catalogue/**`; **cross-module**: `infra/compose/docker/Dockerfile:26-27,171` (references untracked runner — F-02), `infra/compose/compose.modules.local.yaml` (depends_on migrations — WI-OI-109 fresh-install work), `packages/module-sdk/src/signed-context.ts` (+organization claim), `scripts/module-manifests.mjs` (kernel-worker receives every hosted module's private signing key); plans for Phases 4/5 incl. `docs/plans/enterprise-architecture-phase-5-gemini-implementation-prompt.md` (an AI prompt committed as a plan); `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` ("no Build authorization"). |
| 2890f10 (091) | New `modules/universal-inventory/**`; `000001_inventory_warehouse_foundation.up.sql`; proof = `real-database-proof.ts` (direct `InventoryService`, throwaway PG); `scripts/verify-universal-inventory.mjs` = file/string checks. 0 tests. |
| 155061d (092) | New `modules/universal-procurement/**`; edits other WIs' adapters (`catalogue/product-configuration.adapter.ts`, `inventory/inventory-configuration.adapter.ts`). 0 module tests. Core procurement models untouched (duplicate authority, F-06). |
| 5d1aa3a (093) | New `modules/universal-orders/**`; edits Inventory and Procurement web workspaces; ADR-0024 left **Proposed**. 0 module tests. |
| e532d98 (113) | **Frozen AR**: `modules/accounts-receivable/db/migrations/000014_ar_orders_inbox_receipts.{up,down}.sql`, `invoices.service.ts` (+325), `invoices.controller.ts`, `database.service.ts`; 000002 relay migrations for inventory/procurement/orders and their runtime manifests **without regenerating** `compose.module-host.yaml`/`modules.json` (expected version stayed "1" vs manifest/code 2 — `git show e532d98:infra/compose/generated/compose.module-host.yaml` lines 141-151); also stages WI-OI-094 (task card, evidence, ADR-0025, Phase 8 plan) and WI-OI-111 privacy entries (`packages/privacy-gdpr/src/inventory.ts`); `scripts/verify.mjs`. |
| a8207c4 (094) | New `modules/financial-operations/**`; **cross-module**: `modules/physical-operations-cmms/apps/api/src/auth/authorization.ts` (principal shape), `infra/compose/compose.workforce.local.yaml` (Workforce expected migration 19→25, i.e. WI-WFO changes), `infra/compose/docker/pnpm-workspace.yaml`, product-catalogue web; regenerated generated files (repairs e532d98 drift); `package.json` deps added but **lockfile importers not updated** (F-16); `scripts/verify.mjs` + raw-SQL `scripts/verify-financial-operations.mjs` against localhost:5440. |
| b799abd…d731c05 (095, 114–117) | Each: one `00000N_finance_*.up.sql`, runtime-manifest + module.yaml + regenerated gateways/compose, one pure-engine test, one contract test, one raw-SQL proof script added to `scripts/verify.mjs`. babd0b9 also edits `scripts/verify-financial-operations.mjs`. |
| 10bbfba (118) | `000007_finance_period_close_accruals_forecasting.up.sql` added but **runtime-manifest.txt not updated**; `config.ts` contract 6→7 (F-03); module.yaml routes added; generated gateways updated, compose not (consistent with stale manifest). |

### 3.2 Generated files vs authoritative source

| Commit | Generated files changed | Authoritative source changed in same commit? | Result |
| --- | --- | --- | --- |
| 2f18945 | 9 (catalog, roles, gateways, navigation, upstreams, hosted-modules, compose.module-host, modules.json, products page) | module.yaml added; generator `scripts/module-manifests.mjs` itself changed | Consistent, but generator change is unreviewed security behaviour (key fan-out) |
| 2890f10, 155061d, 5d1aa3a, a8207c4 | 9 each | module.yaml added | Consistent |
| b799abd, eb7391a, 51c9ad8, babd0b9, d731c05 | 3 each | module.yaml + runtime-manifest changed | Consistent |
| e532d98 | 0 | runtime-manifest.txt changed for 3 modules | **Stale generated runtime** (expected 1 vs code/manifest 2) — CONFIRMED; repaired in a8207c4 (different WI) |
| 10bbfba | 1 (gateways) | module.yaml changed; **runtime-manifest not updated although a migration was added** | Generated files match the stale manifest, not the code → host start failure (F-03) |

`pnpm audit:module-manifests` derives the expected version from the runtime manifest (`scripts/module-manifests.mjs:958`), so it cannot catch
an unlisted migration or a code/manifest contract mismatch (gap in WI-OI-081).

### 3.3 Modification of previously committed migrations

- None of the 14 phase commits modifies or deletes an existing migration (all migration entries are `A`). CONFIRMED via `--name-status`.
- Repository history (outside the 14): `13cd27a` (2026-09-30 14:07) modified `packages/db/migrations/20260930010000_kernel_job_schedules/migration.sql`
  52 minutes after `943d2f8` created it (adds `GRANT DELETE`); `8c6b915` (2026-09-22) modified Analytics migrations 000004–000010. If either was
  applied before the edit, checksums/grants diverge between databases — **P2, PLAUSIBLE** (deployment timing not provable read-only).
- 007e686 changed `packages/db/schema.prisma` (whitespace) and the migration *runner* invocation, not migration SQL.

### 3.4 Proof scripts — how they exercise the system (identification only; runtime is P3's scope)

| Script(s) | Mechanism | HTTP/browser? |
| --- | --- | --- |
| `modules/{product-catalogue,universal-inventory,universal-procurement,universal-orders}/apps/api/scripts/real-database-proof.ts` | Instantiate `*Service` classes directly against a throwaway PostgreSQL container | No (bypasses controllers, guards, signed context, BFF) |
| `scripts/verify-{financial-operations,treasury-reconciliation,fixed-assets,consolidation,inventory-costing,budgeting-and-commitment-control,period-close-and-forecasting,commercial-operational-convergence}.mjs` | Raw SQL via `pg` to `localhost:5440/gigalibs` (owner DB) with default `<masked-dev-password>` credential; create `rls_test_user`; no cleanup; hard-coded `node_modules/.pnpm/pg@8.23.0` path | No |
| `scripts/verify-{application-dictionary,core-parties-and-custom-apps,product-catalogue-and-pricing}.mjs` | Import built `dist/` libraries and assert in-process | No |
| `scripts/verify-universal-{inventory,procurement,orders}.mjs` | File existence and string `includes` checks on SQL/YAML | No |


## 4. CEO / Product review of deep-scope WIs

Context that applies to every row: the only recorded Release 1 is core + CMMS + Workforce + Geospatial with the manufacturing pack
(`docs/plans/gigaops-convergence-roadmap.md:37-44`; `.pi/work/WI-OI-079.md`); its must-haves G-1 maintenance requests, G-2 automatic PM,
G-3 asset/parts import, G-4 technicians on phones are still open (`.pi/work/WI-OI-079.md:74-77`; CMMS manifest :32-38; WI-OI-084 Proposed).
No KPI baselines or targets exist in the repository for any deep-scope WI; KPIs below are named, not quantified. "Legal/accounting/security
review" means a named qualified human, which none of these rows has.

| WI | Paying user | Problem solved | Workflow enabled | Source of truth | KPI (name only) | Still manual | Explicit exclusions | Support burden | Required review | Release now? | Verdict | Owner-decision conflict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 109 Org hierarchy | Multi-site manufacturer admin | Department-only scoping; no legal/operational trees | Define units/trees, publish via maker-checker, grant scope, link places | Core DB org tables + module replicas | Scope-violation incidents; admin setup time | Data migration from Departments (removed); IdP group mapping | Org 0/global context | Medium (scope errors are security incidents) | Security/IAM, Backend/Data | No — candidate not reproducible (F-02) | RfR | None (core) |
| 110 App Dictionary | Implementation partner / tenant admin | Custom fields/layouts need code | Author metadata, preview, maker-checker publish | ConfigurationChangeSet/PublishedVersion (JSONB) | Config changes without deploy | Everything beyond allow-listed rules | DDL by tenants | High (generic metadata engines attract edge cases) | Security (expression evaluator), Architecture | No | RfR | D7 freezes "custom fields and catalogues" (WI-OI-075 slot) |
| 111 Parties | Any module needing customers/suppliers | Duplicate party masters | Maintain parties/roles/addresses, governed merge | Core DB Party* tables | Duplicate-party rate | Merge adjudication | Cross-tenant sharing | Medium | Privacy (PII), Security, Data | No — migration never executed | RfR | Partly (supplier/customer roles serve frozen AR/AP) |
| 112 Catalogue | Distributor / manufacturer selling goods | No product/UOM/price master | Products, UOM conversion, price lists | `gigalibs_product_catalogue` | Price-resolution errors | Tax, discounts beyond list | Promotions | Medium | Product, Finance (pricing) | No | Contain | D7 "catalogues" frozen |
| 091 Inventory | Warehouse operator | Stock visibility, lots/serials | Receive, put away, transfer, reserve, count | `gigalibs_inventory` (+ CMMS stock ledger — duplicate) | Stock accuracy; count variance | Reconciliation with CMMS parts stock | Costing (moved to 116) | High (two ledgers) | Backend/Data, Architecture | No | Contain | Planned as Wave-2 extraction **from CMMS** (ADR-0013:69) — built as a parallel ledger |
| 092 Procurement | Purchasing / AP clerk | Spend without approvals/3-way match | Requisition → DoA → PO → receipt → match → bill | `gigalibs_procurement` (+ core Prisma procurement — duplicate) | Match exceptions; price-variance holds | Payment execution | Payments | High | Finance/AP, Security (DoA) | No | Contain | "spend and AP" and "CMMS purchase orders, vendors" frozen (D7) |
| 093 Orders | Sales/fulfilment team | Quote-to-ship | Quote, SO, ATP allocation, dispatch | `gigalibs_orders` (invoicing moved to AR by 113) | Fill rate; on-time ship | Credit decisions | Invoicing (AR) | High | Finance (credit/AR), Product | No | Contain | ID reserved for Inspections & Safety; AR frozen |
| 113 Convergence | Same as 091–093 | Modules not talking | Outbox/inbox relays; receipt projections; AR invoice from dispatch | Each module's schema | Relay lag; dead letters | Replay of dead letters | Cross-schema SQL | High (money path through frozen AR) | Finance, Security, Architecture | No | RfR / Contain | Edits frozen AR (WI-OI-019) |
| 094 GL | Controller / accountant | No ledger | Books, CoA, periods, journals, reversals, statements | `gigalibs_finance` | Close duration; unbalanced-journal count (should be zero) | Tax filing, statutory reports | Payments | Very high (financial statements, audits) | **Qualified accountant**, external auditor, Security, Legal (AGPL benchmark) | No | Stop Investment + Contain | "No general ledger in this programme" (roadmap :32; ADR-0013:75) |
| 095 Treasury | Treasurer | Manual bank reconciliation | Import CAMT/MT940/OFX/CSV, auto-match, adjust | `gigalibs_finance` | Auto-match rate; unreconciled items | Bank connectivity (files only) | Payment initiation | Very high (bank data, PII) | Accountant, Security (bank data), Legal | No | Stop Investment + Contain | Same; ID reserved for EAM |
| 114 Fixed assets | Controller | Depreciation by spreadsheet | Capitalise, depreciate, dispose | `gigalibs_finance` (+ CMMS assets — separate) | Depreciation run errors | Tax depreciation books | Leases | High | Accountant, tax advisor | No | Stop Investment + Contain | Same; overlaps CMMS asset register |
| 115 Consolidation | Group CFO | Multi-entity close | FX translation, eliminations, minority interest | `gigalibs_finance` | Elimination mismatches | Rate sourcing | Statutory filing | Very high | Accountant (IAS 21/IFRS 10), auditor | No | Stop Investment + Contain | Same; multi-currency frozen (D7) |
| 116 Costing | Cost accountant | Inventory valuation/COGS | FIFO/AVCO/standard, landed cost, PPV | `gigalibs_finance` reading inventory events | Margin accuracy | Revaluation approvals | Manufacturing (WIP) costing | Very high | Accountant (IAS 2), Data | No | Stop Investment + Contain | Same |
| 117 Budgeting | FP&A | Spend vs budget | Budgets, revisions, encumbrance, hard-stop | `gigalibs_finance` | Budget breaches blocked | Planning inputs | Driver-based planning | High | Finance, Security (hard-stop bypass) | No | Stop Investment + Contain | Same |
| 118 Close & forecast | Controller | Manual close | Subledger locks, checklists, accruals, year-end, forecasts | `gigalibs_finance` | Days to close | Judgemental accruals | Statutory reporting | Very high | Accountant (ASC 606/IFRS 15), auditor | No — breaks HEAD (F-03) | Stop Investment + Contain | Same |
| 080 Layers audit | Engineering | Boundary erosion | `pnpm audit:layers` | Repo config | New violations (should be zero) | Baseline triage | — | Low | Architecture | Internal only | RfR (ADR-0013 reconciliation) | ADR-0013 now contradicted by Phases 4–14 |
| 081 Manifests | Engineering / solution builder | Hand-maintained catalogue | module.yaml → generated catalogue/runtime | module.yaml | Drift findings | — | — | Low | QA | Internal only | RfR (checks miss F-03) | — |
| 082 Module SDK | Module developers | Duplicated runtime code | Shared guard, relay, inbox | `@gigalibs/module-sdk` | Modules on SDK | — | — | Medium (security core) | Security | Internal only | RfR (re-cert after 2f18945) | — |
| 083 Web extension | Solution builder | Shell hard-codes modules | Manifest-driven routes/gateway | Generated files | Pages without code | — | — | Medium | Security (gateway root, open per row) | Internal only | RfR | — |
| 084 Mobile shell | Technician (R1) | No phone work | Offline work orders | Not built (ADR-0014 absent) | Mobile completion rate | Everything | — | — | Security, UX | Not built | RfR (start it) | Release-1 blocker not started while Phases 4–14 were built |
| 085 module:new | Module developers | Boilerplate | Generator + conformance | Generator | Conformance pass rate | — | — | Low | QA | Internal only | Conditional Ship (internal) | — |
| 013 IAM | Every enterprise tenant | No enterprise SSO/recovery | IdP/SCIM/SAML/WebAuthn | Core IAM | SSO adoption | Provisioning | — | High | Security | No (No-Go) | RfR | — |
| 019 / 035 / 040 AR | Billing team | Invoicing/AR | Invoices, payments, aging, event billing | `gigalibs_ar` | DSO | — | — | High | Finance | Frozen | Frozen-no verdict change | Freeze breached by 113 and by finance `requiredModules` |
| 039 Config Studio | Tenant admin | Code changes for forms | Versioned forms/config | Configuration tables | Changes without deploy | — | — | Medium | Independent Security/QA (self-accepted so far) | No | RfR | — |

**CEO bottom line.** Roughly 50k inserted lines (14 commits) went into nine capability modules that the owner's own recorded decisions put
outside Release 1, while every Release-1 must-have (G-1…G-4) is still open. The finance stack (094/095/114–118) creates the highest support and
liability exposure in the product (financial statements, consolidation, bank data) with zero qualified accounting review and an unresolved AGPL
benchmark question. Recommend: freeze and contain Phases 4–14, fix F-02/F-03/F-16 so HEAD is buildable, and redirect capacity to WI-OI-086–090 and 084.

## 5. Requirement and ADR traceability

### 5.1 FR/NFR linkage (`docs/REQUIREMENTS_BASELINE.md`, last changed 2026-09-14 per `git log`; "Last additive change: 2026-09-10", :4)

| WI(s) | FRs cited in registry | Problem |
| --- | --- | --- |
| 091, 092, 093, 113, 094, 095, 114–118 | Identical copy: FR-01, FR-02, FR-04, FR-05, FR-08, FR-09, FR-10, FR-11, FR-12, FR-14, FR-15 (091 omits FR-02) | Baseline has **no FR** for inventory, procurement, orders, GL, treasury, fixed assets, consolidation, costing, budgeting or close. Cited FRs are platform outcomes (Outcome Catalog, Command Center, Value Ledger…). 113 edits AR invoicing but does not cite FR-17. G1 ("requirements baseline") therefore not met for these WIs. |
| 110, 111 | FR-01…FR-17 subset incl. FR-13 (Demo Lab) and FR-17 (AR) | No dictionary/party requirement; FR-13/FR-17 linkage unexplained. |
| 112 | FR-01, 04, 05, 11, 14, 15 | No catalogue requirement. |
| 109 | FR-04, 05, 14, 15 | Plausible (FR-14 tenant admin). |
| 080–085 | FR-01, 02, 12, 14 | Generic; acceptable for platform tooling. |
| All deep rows | NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004 | No performance, usability (NFR-UX-003 ≥80% first-time completion) or observability evidence exists for any phase module. |
| 022, 031, 033, 035 | NFR-FIN-001–004 | **NFR-FIN is not defined** in the baseline (0 matches); also used in `docs/runbooks/usage-metering-and-billing.md:5`. |
| 008 (evidence) | NFR-SC-001–004 | **NFR-SC is not defined** in the baseline. |

### 5.2 ADR existence and status

| ADR | File status line | Claimed elsewhere | Verdict |
| --- | --- | --- | --- |
| ADR-0013 | Proposed (direction owner-approved 2026-09-28) (:3) | Row 080 "ADR-0013 Proposed" | Consistent; but its "No general ledger" (:75) and extraction rules (:69-70) are contradicted by Phases 5–14 |
| ADR-0016 | Proposed; owner approved F1–F17 2026-09-29 (:3) | Row 102 "owner-approved" | Consistent |
| ADR-0019 | "Accepted for Implementation (WI-OI-110)", owners = roles (:3-5) | — | Producer self-acceptance; depends on Proposed ADR-0013/0016 |
| ADR-0020…0023 | Accepted (:3) | — | Producer self-acceptance; ADR-0020:5 names Security & Privacy as decider without a review record |
| ADR-0024 | **Proposed** (:3) | Row 138 "amended ADR-0024" | Orders module built on a Proposed ADR |
| ADR-0025 | Accepted (:3); created in e532d98 (WI-OI-113 commit), edited in a8207c4 | Evidence 094 "authored and accepted" | Self-acceptance; cross-WI staging |
| ADR-0026 | **Proposed** (:3) | Row 138 "amended…via ADR-0026"; `.pi/work/WI-OI-113.md:27` "ADR-0026 approved" | **False approval claim (F-08)** |
| ADR-0027…0029 | Accepted (:3) | Evidence "authored and accepted" | Self-acceptance |
| ADR-0030, 0031, 0032 | Accepted (:3) | Rows 143-145 "ADR-00NN accepted" | Self-acceptance in the same commit as the code |
| ADR-0014 (mobile) | **Does not exist** | Row 110 (WI-OI-084) cites it | Missing (known, `.pi/handoff/HANDOFF-2026-09-29.md:210`) |
| ADR-0012 (pay sealing) | **Does not exist** | Row 101 (WI-OI-070) | Missing; owner decision open |

## 6. Remaining P2 / P3 findings (not already in the top table)

| ID | Sev | Finding | Evidence | Tag |
| --- | --- | --- | --- | --- |
| F-18 | P2 | Gate column "Active" on 12 Review rows; WFO rows have no gate; EAM rows use invalid status "In Review" and `audit:sdlc` skips them (validator regex widened only for WFO in 94fae89) | `.pi/WORK_ITEMS.md:121-145`; `scripts/verify-sdlc-governance.mjs:61` | CONFIRMED |
| F-19 | P2 | Non-`WI-OI` IDs (WI-WFO-*, WI-EAM-*) for behaviour changes | `AGENTS.md:47` | CONFIRMED |
| F-20 | P2 | Release-1 certifications are stale: CMMS and Workforce were changed after their exact-image certification (CMMS migrations 000015–000019, Workforce 000020–000025) and the changes are uncertified | rows 69, 91-100; commits a1cea16…22cfffa, 94fae89 | CONFIRMED |
| F-21 | P2 | Generated runtime drift committed at e532d98 (host would fail at that commit), repaired in another WI's commit | §3.2 | CONFIRMED |
| F-22 | P2 | Historical edits to committed migrations (13cd27a, 8c6b915) | §3.3 | PLAUSIBLE impact |
| F-23 | P2 | WIP limit never exercised; ~14 L/XL items built in ~36 h (L sized 4–6 weeks, roadmap :66-67), e.g. b799abd 16:38 → eb7391a 17:13 → 51c9ad8 17:43 | `git log`; `config/sdlc-governance.json:39-40` | CONFIRMED |
| F-24 | P2 | `pnpm verify` disables pnpm dependency verification | `scripts/verify.mjs` env (007e686, e532d98) | CONFIRMED |
| F-25 | P2 | Requirements baseline vs registry contradictions (FR-01/07/08/09/13/16) and undefined NFR-FIN/NFR-SC | §5.1, D-14…D-19 | CONFIRMED |
| F-26 | P2 | PLAN.md stale (Release 1 = AP; "adds no general ledger") | `.pi/PLAN.md:22-28,74` | CONFIRMED |
| F-27 | P2 | Module manifest traceability: finance `workItem` names one of six WIs; CMMS/Workforce/AR manifests name pre-expansion WIs; CMMS still lists iot-ingress/automatic-pm contained while WI-EAM-004 claims auto-firing work orders | D-58, D-59, D-29 | CONFIRMED |
| F-28 | P2 | WI-OI-039 "Production Alive Confirmation" by one person acting as PO, SA and QA Lead | `docs/reviews/UNIVERSAL_UI_…ACCEPTANCE.md:1-5` | CONFIRMED |
| F-29 | P2 | WI-OI-028 row describes retired platform-rbac; module dir now untracked | row 36; 167323a | CONFIRMED |
| F-30 | P2 | ADR dependency inversion: "Accepted" ADR-0019…0032 depend on Proposed ADR-0013/0016/0024/0026 | ADR headers | CONFIRMED |
| F-31 | P2 | Cross-WI staging: WI-OI-094 card/evidence/ADR-0025 committed in e532d98; WI-OI-111 privacy entries in e532d98; WI-OI-109 work in 2f18945 and 007e686 | §3.1 | CONFIRMED |
| F-32 | P2 | Proof scripts embed credentials/defaults (`<masked-dev-password>`, `<masked-dev-password>`) and create a persistent `rls_test_user` with `GRANT ALL` on `gigalibs_finance` | `scripts/verify-period-close-and-forecasting.mjs:37,667-671`; `verify-financial-operations.mjs:641-644` | CONFIRMED (code) |
| F-33 | P2 | "Hardware Row-Level Security", "production-grade", "tamper-proof", "certified" wording across phase docs | D-56, D-57 | CONFIRMED |
| F-34 | P2 | iDempiere source (`/Users/rayapudi/idem`) structurally analysed for ADR-0019/0020 and WI-OI-109; licence review not recorded | `ADR-0019…:17`; `.pi/tasks/WI-OI-110.md:57` | PLAUSIBLE |
| F-35 | P2 | Program master spec and Phase 1–3 plans are untracked (`docs/iDempiere_to_Gigalibs_Enterprise_Architecture_Spec.docx`, `docs/plans/enterprise-architecture-phase-3-…md`) yet cited by committed cards | `.pi/tasks/WI-OI-094.md:44`; `.pi/tasks/WI-OI-111.md:33` | CONFIRMED |
| F-36 | P3 | Registry table shape broken (8 cells in 7-column table, rows 121-145) | D-62 | CONFIRMED |
| F-37 | P3 | Proofs import `../node_modules/.pnpm/pg@8.23.0/...` (machine-specific) | `scripts/verify-financial-operations.mjs:25` | CONFIRMED |
| F-38 | P3 | AI prompt committed as plan (`docs/plans/enterprise-architecture-phase-5-gemini-implementation-prompt.md`) | 2f18945 | CONFIRMED |
| F-39 | P3 | WI-OI-106 row stale on migration 000026 | D-24 | CONFIRMED |
| F-40 | P3 | Missing evidence files for WI-OI-001, 002, 004, 084, 108 | `git ls-files .pi/work` | CONFIRMED |
| F-41 | P3 | Verify logs cited from `/var/folders/...` (ephemeral) as evidence | `.pi/work/WI-OI-109.md:319-320` | CONFIRMED |
| F-42 | P3 | WI-OI-054 promotes the rule engine while "Rule Pro" is on the D7 freeze list (ambiguous) | row 85; `.pi/work/WI-OI-079.md:87` | CONFIRMED |
| F-43 | P3 | Task-card/evidence non-standard status vocabulary (Complete, Done, IN_REVIEW, Ready for Review) | D-40…D-52 | CONFIRMED |
| F-44 | P3 | WI-OI-074 "Ready" while paused | D-21 | CONFIRMED |

Severity tally: P0 = F-01, F-02 (2). P1 = F-03…F-17 (15). P2 = F-18…F-35 (18). P3 = F-36…F-44 (9). Register rows carry their own severity;
P1 register rows (e.g. D-34 NOW.md "complete", D-43 card "Done", D-55 self-accepted ADRs) are instances of F-03/F-04/F-07/F-08/F-14.

## 7. Method notes and deviations

- Read-only on the repository; no file under `/Users/rayapudi/dev/gigalibs` was created, modified or staged by this auditor.
- One command (`node scripts/module-manifests.mjs` without `--write`, a pure check) was refused by the permission layer; not retried.
- Deviation from the single-output-file rule: early in the session I wrote helper files (`wi_rows.tsv`, `c_*.txt`, `allfiles.txt`,
  `c_inventory.md`) into this same scratchpad `audit/` folder (outside the repository). They are removed after this report is written.
- Facts supplied by the primary agent and not re-verified here: running image `007e686bebee-c1746f0b541b`, its contents (Phases 2–7) and that no
  financial-operations service is deployed. The lockfile claim was re-verified (F-16).
