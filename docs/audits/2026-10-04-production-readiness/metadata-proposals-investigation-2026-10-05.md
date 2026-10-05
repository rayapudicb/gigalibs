# Metadata proposals and current-build investigation

Date: 2026-10-05. Work item: WI-OI-119, owner-requested follow-up. Disposition: **Review; production NO-GO**.
This is an investigation and repair assessment, not an implementation authorization or a production certificate.

## 1. EXECUTIVE VERDICT

The build contains substantial reusable engineering, but it does not yet deliver the complete business product
described by its phase documents. The central failure is the gap between a declared capability and an executable,
authorized, persisted, recoverable user journey. Metadata contracts, domain services, tables, event declarations
and passing proof scripts were repeatedly treated as evidence of an integrated outcome they did not exercise.

The two supplied proposals identify this gap correctly. They are not safe to adopt literally. Some statements
are too broad, some conflict with GigaLibs' existing architecture, and some would cause unnecessary replacement
of useful work. In particular, a single database schema, a magic system tenant, a universal document state graph,
and posting every completed document are not prerequisites for a sound metadata-driven SaaS product.

**A full rewrite is not justified. Zero code changes are also impossible.** Missing request paths, placeholder
persistence, security defects and missing consumers require implementation. The defensible approach is to repair
and connect existing components, extend the existing dictionary, and replace demonstrably fake or unsafe paths.
The evidence does not support a percentage-complete claim, a cost estimate, or a production date.

### 1.1 Evidence boundary: three different builds

| Layer | Evidence available | What it proves and does not prove |
| --- | --- | --- |
| Original comprehensive audit | [WI-OI-119 report](README.md), source `76b9452`, 23 committed modules, 107 pages, 91 BFF handlers, 182 controllers, 197 migrations, 115 registry rows | Baseline findings: 13 P0 and 29 P1. These are historical baseline counts, not a freshly reconciled count of defects remaining after U1/U2. |
| Last recorded UAT deployment | Release `03ebd0c366b6-ff554c98771d`, 2026-10-05 04:57 UTC; [state record](../../../.pi/NOW.md), [UAT board](uat-module-status.md) | U1 build/runner/manifest repairs and Workforce recovery are recorded; Finance starts. CMMS remains down. Four ERP modules still have the recorded authenticated-request schema defect until U2 is deployed. |
| Current checkout | HEAD `f001270`, including U1b commits; dirty U2 services, migrations, proxy, generated files and tests; untracked ADR-0033 and action specification | U2 implementation and recorded isolated HTTP proof are visible. These files are not the deployed release. Their presence does not close a production finding. |

The follow-up re-read both pasted proposals, inspected the current code and changes, and cross-checked the
existing four audit appendices. It did not repeat a new independent executable certification of all 115 rows.
Docker access was denied in this session, and loopback checks of web/API ports were unreachable from this execution
context. Consequently, the runtime statements above are **recorded deployment evidence**, not a fresh observation
that those services are currently healthy or unhealthy. No database, service, secret, product file or deployment
was changed by this follow-up. Documentation verification is recorded in the WI evidence file.

The source proposals are the owner's two attachments:

- `18309a44-5757-487e-9e3a-eda86f7d8226/Pasted text.txt`: deep metadata SaaS and architectural-purity audit brief.
- `83257864-e7b8-4441-9c66-8773a595c988/Pasted text.txt`: foundational principles and iDempiere comparison.

These are hypotheses and desired behavior to test, not independent proof of what the code does. Local iDempiere
sources provide a useful conceptual reference; this report does not certify their suitability, licensing or
accounting treatment for GigaLibs.

### 1.2 What happened

The following explanation follows from code, commit history and evidence records. It does not establish any
individual's intent.

1. **Delivery advanced horizontally across phases before complete journeys were proved.** Inventory, Orders,
   Procurement and Finance acquired services, contracts and screens, but their screen controls and event chains
   remained disconnected. The next phase reused the claim of a completed predecessor rather than a passing
   integrated acceptance test. See [phase/file inventory](appendix-p1-product-and-work-items.md#3-deliverable-c--file-change-inventory-of-the-14-phase-commits).
2. **The dictionary's definition layer outgrew its execution layer.** The contract describes relationships,
   lookups, conditional fields, views and actions. The renderer implements a subset, while four workspaces supply
   their own constant manifests and local form state. Naming a component `DictionaryRenderer` did not make the
   workspace metadata-governed or persistent.
3. **Tests exercised a different path from the user.** Direct service tests and raw SQL verified useful pieces but
   bypassed the BFF, entitlement checks, authentication guards, controller validation and event consumers. Some
   finance services could fail while the corresponding SQL proof passed. See [proof classification](appendix-p3-backend-data-integration.md#7-proof-script-classification-wi-oi-091-to-118).
4. **Static gates had blind spots.** The runtime-data scan omitted relevant roots/patterns; design-token compliance
   was not enforced; CI did not run the full build, tests and supply-chain gates. Green checks therefore did not
   support the claims made from them.
5. **Code, image, migration and status records diverged.** Uncommitted migration dependencies, an unrecorded deploy,
   a runtime-manifest mismatch and manually applied migrations broke reproducibility. The audit itself also ran a
   verifier that wrote proof data into the owner's database; that incident is explicitly recorded in
   [.pi/work/WI-OI-119.md](../../../.pi/work/WI-OI-119.md#incident-the-primary-agent-wrote-to-the-owners-local-database-2026-10-04-1619z).
6. **Acceptance did not challenge the producer's claims sufficiently.** G5/G6 and accounting-compliance claims lacked
   the independent evidence required by the repository. Scope also drifted from the then-recorded manufacturing
   release. The owner's later decision to include all phases resolves the current scope choice; it does not
   retrospectively certify earlier work.

These are process and integration failures with concrete technical consequences. Another broad agent prompt
without per-action acceptance evidence would leave the same failure mechanism in place.

### 1.3 Progress and pending work across the phases

This is a current interpretation over the historical audit, not an upgrade to the canonical WI registry.
No phase has production acceptance established by this investigation.

| Phase / WI | Useful work present | Business completion still missing or unproved |
| --- | --- | --- |
| Wave 0 / 080–083 | Layer checks, module manifests, generation and web extension points | Enforced ownership across the later ERP work; independent gateway/security review; deployment and event-contract checks covering actual runtime. |
| Mobile / 084 | Requirement and planning artifacts | Production mobile/offline shell and its acceptance evidence; never-built scope in U27. |
| Generator / 085 | Reusable module scaffolding and catalogue generation | Generator output is an internal tool result, not certification of the generated module. |
| Phase 1 / 109, Organization | Strongest traced enterprise user flow; hierarchy/version/scope foundations | Re-test the repaired install and deployed build; independent review; propagation to all consuming modules; action-level UAT. |
| Phase 2 / 110 and 039, Dictionary | Contracts, compiler, configuration governance, partial renderer | Published-manifest adoption, safe permissions, real lookups/grids/actions, owning-module persistence and usable runtime extension flows. |
| Phase 3 / 111, Parties | Party model and API-backed workbench | Role grants, complete edit/merge flows, safe references and adoption by buyers, sellers and other consumers. |
| Phase 4 / 112, Catalogue | Relatively mature signed API, commands, persistence, idempotency and API-backed UI | Tenant entitlement, deployed proxy fix, dictionary fallback removal, consistent event names and consumers, complete UAT. |
| Phase 5 / 091, Inventory | Warehouses, ledger/quantity services, contracts and schema | Real screens/barcodes, complete command safety, stock authority with CMMS, relay consumers, audit and inventory-to-costing reconciliation. U2 auth repair is local. |
| Phase 6 / 092, Procurement | Requisition/PO/bill/matching services and schema | Real actions; approvals/SoD; budget reservations; receipts from Inventory; audit/outbox; one payable authority and posting/payment flow. |
| Phase 7 / 093, Orders | Order/allocation/dispatch services and schema | Real screens; active customer/product validation; credit/stock reservations; AR ownership; idempotent commands and fulfilled-order journey. U2 repairs partial-allocation event versions locally. |
| Convergence / 113 | Event contracts and inbox-shaped endpoints | Secure registered relays/consumers and actual business effects; direct SQL insertion into both ends is not convergence evidence. |
| Phase 8 / 094, GL | Books, accounts, journal/period services, exact-money foundations | Operational event posting, immutable journal enforcement, safe command retries, role/scope review, real UI and independent accounting acceptance. U2 atomicity/period-route fixes are local. |
| Phase 9 / 095, Treasury | Bank statement, matching and reconciliation code | Real UI/import journey; provider or manual-payment boundaries; fee/match atomicity; reconciliation and sensitive-data controls. U2 still records a separate fee-match transaction. |
| Phase 10 / 114, Fixed assets | Financial asset/depreciation logic | Authoritative relationship to CMMS assets, complete actions, operational source events, idempotent runs and reviewed accounting results. |
| Phase 11 / 115, Consolidation | Group, entity and elimination calculations | Reliable transactional execution, complete consolidation treatment and finance review, real inputs/UI. U2 repairs several transaction/outbox defects locally. |
| Phase 12 / 116, Costing | Cost methods, layers and valuation services | Receipt/issue consumers; quantity/value reconciliation; reviewed rounding; real margin flow. U2 supplies local journal rollback evidence, not the cross-module journey. |
| Phase 13 / 117, Budgeting | Budget/revision/commitment structures and logic | Procurement actually reserving/releasing commitments, concurrent overspend protection, approval flow, real variance UI. |
| Phase 14 / 118, Close/forecast | Checklist, lock, accrual and forecasting code | Locks on every applicable posting path, draining/reconciling pending events, real inputs/actions and accepted close evidence. U1 fixed the host manifest problem; that does not complete close. |
| Non-phase operational work | CMMS, Workforce, Analytics, Geo, Connector and control-plane capabilities | Current CMMS recovery; unrouted calls; fake Time/connector/communications paths; independent release and recovery gates. |
| Never-built extensions | Manufacturing, Projects, RMA and mobile requirements | These require new implementation, not just defect repair. U24–U27 record them. |

The [all-WI matrix](appendix-p1-product-and-work-items.md#1-deliverable-b--wi-matrix-all-115-registry-rows) preserves
the individual 115-row inventory. Its original containment/stop-investment recommendations predate the owner's
all-modules UAT decision and must not be mistaken for the current scope. The
[current remediation backlog](remediation-backlog.md) maps work to U1–U29 and F0–F2. U1/U1b have committed changes;
U2 has local changes and recorded tests; later cards are requirements, not completed functionality.

## 2. MODULE-BY-MODULE AUDIT MATRIX

The 23 rows below cover the committed module manifests. Organization, Parties and Configuration are additional
control-plane capabilities, not extra registered module directories. Paths in this table are repository-relative.
P0/P1 identifiers refer to the primary [defect register](README.md), whose consolidated severity takes precedence
over appendix-local numbering. A dash or an unproved item is not a clean bill of health.

| Module / path | UI and functional-action evidence | Outcomes and events | Tenant/security and present disposition |
| --- | --- | --- | --- |
| `modules/product-catalogue` | `web/src/ProductCatalogueWorkspace.tsx` uses APIs; published dictionary has a built-in fallback. U1b restyling is committed. | Product/UOM/pricing services reusable; emitted event names differ from declarations; no ERP consumers. | Signed API and command checks are comparatively strong. Recorded entitlement block; U2 proxy fix local. U7 acceptance still required. |
| `modules/universal-inventory` | `web/src/UniversalInventoryWorkspace.tsx:60,207,312,435,479,486`: constant manifest, simulated barcode, static KPIs, local extensions, dead New actions and unsupported live-data wording. | Receipt/issue facts do not reach Procurement/Finance; CMMS stock remains separate. | Revocation mismatch repaired only in U2 worktree; extension-owner check at control adapter `inventory/inventory-configuration.adapter.ts:255` verifies type/nonempty IDs, not owner existence. |
| `modules/universal-procurement` | `web/src/UniversalProcurementWorkspace.tsx:46,168,296,362,426,531`: constant manifest, default tenant/org, static data/match rows and dead actions. | No service outbox writes in baseline; no budget/DoA/SoD chain; no trusted receipt consumption or AP/GL journey. | U2 auth repair local; incomplete command idempotency, pagination, runtime validation and object scope. |
| `modules/universal-orders` | `web/src/UniversalOrderWorkspace.tsx:51,172,311,444,595`: constant manifest, default tenant/org, static orders and six disconnected actions. | No actual Inventory reservation/AR relay; split invoice authority. | User-callable invoice inbox and incomplete command idempotency; U2 auth/allocation fixes local. |
| `modules/financial-operations` | `web/src/FinancialOperationsWorkspace.tsx:87,168,350,421,519,608,688,789,2533`: sample datasets throughout Phases 8–14 and local extension editor. | `ingestSubledgerEvent` has no runtime ERP caller; journal/subledger/outbox faults have U2 repairs; full integrated posting is absent. | Replica RLS and source-journal dedupe added in local migration 8; request idempotency and complete scoped authorization still require proof. |
| `modules/accounts-receivable` | Frontend `apps/workflow-platform/app/(app)/ar/**`; Appendix P2 records client-created seal/installment presentation. Recorded backend not deployed. | Invoice/payment code exists; AR-to-Finance not wired; AR/Orders/control-plane invoice overlap. | `apps/api/src/payments/webhooks.controller.ts:47,61,96`: fallback secrets and payload tenant. Transaction-local tenant binding needs repair. |
| `modules/spend-management` | `web` workbench uses an API; no new static-data finding established here. Recorded backend not deployed. | Expense outbox does not drain; AP responsibility overlaps Procurement/control plane. | API DTOs lack runtime validation in audited paths, lists lack bounds, FORCE RLS absent in baseline. |
| `modules/tax-configuration` | API-backed workbench; not recorded as deployed. | Tax inbox service has no registered ingress/caller; real order/invoice tax flow unproved. | Tenant setting outside the query transaction and non-production superuser tolerance require review. No tax correctness certification. |
| `modules/multi-currency` | `apps/api/src/revaluation/revaluation.service.ts:55–74` fabricates a CTA and reports a standards label. | Currency inbox disconnected; real scoped FX inputs and reviewed calculation absent. | Query tenant binding defect. This is a financial-truth stop-ship defect, independent of UI appearance. |
| `modules/physical-operations-cmms` | API-backed workspaces; 37 client calls lack gateway routes (Appendix P2). | CMMS↔Workforce relay code exists. Universal stock/financial asset integration absent. | Recorded CMMS service down from migration defects; monetary roll-ups and exact scoped journey need proof. |
| `modules/gigaops` | `GigaOpsWorkforceWorkbench.tsx:165` routes Time to static hub; `PlantOperationsHub.tsx:265,295` simulates saves; `/wfo/*` calls unrouted. | Existing CMMS and Analytics edges are reusable. Expense/time/payroll integration requires action-level acceptance. | Workforce recovery recorded under U1. Offline queue key is not user-scoped; financial arithmetic needs bounded review. |
| `modules/analytics-studio` | API-backed dashboards and exploration; no new fake-data finding established in this follow-up. | Receives Connector, Geo and Workforce facts through registered inboxes. | Running per deployment record, not re-tested here. Place-scope consistency, export permissions and current UAT remain open. |
| `modules/geospatial` | API-backed maps; no new fake-data finding established here. | Hub→Geo and Geo→Analytics paths exist. | FORCE RLS coverage/role ownership and place-scope alignment need proof; existing dead-letter replay decision remains open. |
| `modules/universal-connector-hub` | Separate frontend `apps/workflow-platform/app/(app)/connectors/[slug]/page.tsx:46–49` fakes credential save. | Real Hub→Analytics/Geo relay code exists; OAuth callback routing gaps also recorded in P2. | `apps/api/src/webhooks/webhooks.service.ts:128–156`: caller tenant and optional signature verification. Repair credentials/provider outcomes and ingress security. |
| `modules/communications` | `apps/workflow-platform/lib/communications-store.ts:132,578–583`; BFF fallback `app/api/communications/[...path]/route.ts:97–100`; simulated voice panel. | No committed module API supporting these reported deliveries; real delivery receipts/reconciliation missing. | False delivery success is P0. Untracked TextFly material is source inventory, not an accepted replacement. |
| `modules/universal-rule-pro` | Web uses `lib/universal-rule-kernel-store.ts:533–568`; rules are mutable in process memory, across tenant IDs. | API backend not deployed in the recorded instance; persistence and evaluation authority split. | Kernel write scope flaw plus unguarded module controllers accepting caller tenant. P0-04/P0-05. |
| `modules/workflow-studio` | Frontend template import/API-key calls lack upstream endpoints (Appendix P2). | Registered workflow inbox service does not establish an operational consumption path; durable execution outcomes need proof. | `apps/api/src/workflows/workflows.controller.ts:8–14,47–55` accepts caller tenant without module auth. Recorded API not deployed. |
| `modules/universal-data-studio` | API-backed screen can open; recorded backend unavailable. | Data contracts/lineage UI is not proof of enforced contracts in business flows. | `apps/api/src/contracts/contracts.controller.ts:19–27,68`: caller-controlled tenant; no module authentication in audited source. |
| `modules/autonomous-recovery-studio` | API workbench; recorded backend unavailable. No new static-data finding established. | Recovery actions and external effects lack current end-to-end acceptance. | Tenant GUC transaction binding, validation and FORCE RLS gaps in baseline. Do not equate a recovery screen with a tested recovery process. |
| `modules/esignature` | Workbench/API; development token path and unavailable recorded backend. | Provider signing, tamper evidence, webhook and reconciliation journey unproved. | Tenant binding and production identity/provider configuration need proof; module presence certifies no legal signature outcome. |
| `modules/document-scanner` | Scanner frontend also calls missing `/api/ap/invoices`; no accepted runtime backend. | Extraction→human correction→canonical document chain unproved. | `apps/api/src/auth/authorization.ts:69–108`: insecure-mode header tenant/permissions; default-mode production readiness unproved. |
| `modules/ontology` | Prototype screen and API source; no accepted runtime backend. | Asset/entity overlap is not resolved by adding an ontology record; downstream effects unproved. | Prototype authentication defaults, no complete runtime validation/transaction/audit evidence in baseline. |
| `modules/saga-orchestrator` | Prototype screen includes failure-simulation control; no accepted runtime backend. A test control alone is not proof of fake production effects. | Persisted orchestration/retry/compensation for the required ERP journeys not established. | Prototype authentication, tenant binding and production failure semantics require review. |

Additional shared/control-plane findings:

- `apps/playground-api/src/scim.controller.ts:62–118`: permission/role elevation and fallback tenant, P0-06.
- Governor caller-selected tenant/tier authorization issues: Appendix P3 §1; keep them in the security review even
  though there is no separate phase for them.
- Organization is a real reusable flow. Parties is API-backed but lacks complete role-granted edit/adoption flows.
- `apps/playground-api/src/configuration-adapter.registry.ts:15–26` centrally constructs the domain adapters.
  Registration here can be legitimate control-plane composition, but modules do not yet supply the proposed
  versioned dictionary contribution files. A repository search found no `modules/*/dictionary/*.json`.
- Public demos, the parked FastAPI plane, quarantined packages and untracked prototypes remain outside production
  certification. Their existence must not be counted as functionality delivered by the active candidate.

The detailed [functional-action matrix](appendix-p2-frontend-and-user-flows.md#2-deliverable-d--functional-action-matrix)
and [event matrix](appendix-p3-backend-data-integration.md#2-deliverable-h--event-matrix) remain part of this report.
They distinguish a navigation tab from a business action and an event declaration from an active handler.

## 3. CRITICAL ARCHITECTURAL DEFECT REGISTER

### 3.1 Existing stop-ship and high-priority findings: current interpretation

This table carries all primary P0/P1 IDs forward. It describes repair requirements, not authorization to implement
them. "U2 local" means source changes plus recorded tests; it does not mean independently accepted or deployed.
Exact original evidence is retained in [README §3–4](README.md#3-p0-register-stop-ship) and its linked appendices.

| ID | Defect / consequence | Repair requirement and evidence status |
| --- | --- | --- |
| P0-01 | ERP screens show invented business truth | Bind visible data and actions to authorized persisted APIs; remove sample/default-tenant behavior. Still present in inspected workspaces. |
| P0-02 | Communications falsely reports provider delivery | Real provider state/receipt and durable storage; explicit failures. No closure evidence. |
| P0-03 | Time/Plant/connector timers report unperformed actions | Replace simulated success paths with real domain/provider commands; successful reload proof. No closure evidence. |
| P0-04 | Cross-tenant in-memory rule mutation | Persistent scoped rule authority; separate permissions per action; negative tenant tests. No closure evidence. |
| P0-05 | Studio APIs trust caller tenant without authentication | Verified identity and scope at each module boundary, with direct-port negative tests. No closure evidence. |
| P0-06 | SCIM role escalation/default tenant | Dedicated provisioning authority, role allow-list and verified tenant binding. No closure evidence. |
| P0-07 | Payment webhook fallback secrets/payload tenant | Configured verified provider ingress and credential-to-tenant binding; replay protection. No closure evidence. |
| P0-08 | Connector webhook optional verification | Mandatory authentication appropriate to the connector; trusted connection scope; raw-payload verification where required. No closure evidence. |
| P0-09 | Orphan/duplicate costing and consolidation journals | Local subledger, journal and outbox share one transaction; source uniqueness and failure proof. U2 local repair and recorded HTTP rollback test. |
| P0-10 | Invented currency translation adjustment | Remove fabricated calculation/claim; implement and independently validate the intended calculation. No closure evidence. |
| P0-11 | Unsupported certification | Evidence must exercise claimed path and bind to artifact; corrected registry language helps but does not supply missing tests/review. |
| P0-12 | Nonreproducible build/fresh install | U1 committed runner/lockfile/manifest repairs and recorded clean build substantially address baseline. Current dirty U2 still requires its own accepted artifact. |
| P0-13 | Restore/PITR claims unsupported | Restore all current schemas and rehearse declared recovery objectives with retained evidence. No closure evidence. |
| P1-01 | Finance manifest prevents module-host start | U1 committed/deployed migration-list repair; recorded Finance startup. Keep regression check; current release still needs application acceptance. |
| P1-02 | Revocation schema prevents authenticated ERP calls | U2 forward migrations and recorded signed HTTP tests; deployment outstanding. Also prove revocation propagation, not only successful guard queries. |
| P1-03 | Incomplete/invalid outbox INSERTs | U2 local helper supplies required envelope/versions; prove all real producers and delivery paths. |
| P1-04 | ERP events have no operating delivery chain | Reuse signed relay/inbox infrastructure; register producers/consumers; validate schemas, replay and reconciliation. Still open. |
| P1-05 | User-forgeable ERP inbox calls | Service-source authorization and body-bound signed events; durable dedupe inside effect transaction. Still open. |
| P1-06 | Procurement lacks authority/budget controls | Enforce applicable DoA, SoD, budget reservation, audit and events in the server command. Still open. |
| P1-07 | Period locks bypassable outside Finance | Authoritative checks on applicable accounting paths, including async arrivals; explicit close/reopen and pending-event policy. Still open. |
| P1-08 | Multiple masters write the same business fact | Decide owner per fact; migrate references through compatibility adapters; preserve source IDs and historical snapshots. Still open. |
| P1-09 | Second partial allocation reuses event version | U2 local version allocation/locking and recorded two-allocation HTTP test. Not deployed. |
| P1-10 | Tenant GUC set outside transaction | Bind context and queries to one connection/transaction; test pool reuse and tenant crossing. Not shown closed. |
| P1-11 | Prototype authentication fail-open risk | Explicit production configuration and signed/verified scope; reject insecure runtime settings. Confirm exposure per service; do not turn a plausible finding into a proven exploit. |
| P1-12 | Frozen AR changed indirectly | Owner now includes AR; reconcile canonical ownership, dependencies and acceptance records. New scope authorization does not fix integration. |
| P1-13 | CMMS/Workforce migration outage | Workforce recovery recorded under U1; CMMS remains open in deployment record. |
| P1-14 | Deployed image differs from state record | U1 deploy recorded. Require image digest/commit/migration evidence for every subsequent deployment. |
| P1-15 | Untracked/manually applied migration history | U1 brings dependencies into git; historical checksum/ledger and forward-recovery reconciliation still need evidence. |
| P1-16 | Verification polluted owner database | U1 isolated-proof gate added. Historical data cleanup is still owner decision D5. No database cleanup performed here. |
| P1-17 | Incomplete static audit coverage | Extend coverage to actual registered/runtime roots and require behavioral tests. A green scanner alone is insufficient. |
| P1-18 | Finance organization replicas lack RLS | U2 local migration enables/forces policies; fresh/upgrade tests recorded. Deployment and negative role tests required. |
| P1-19 | ERP proof bypasses HTTP/auth | U2 adds meaningful isolated module-host HTTP proof. Browser, BFF, entitlement, full retry and integration coverage remain incomplete. |
| P1-20 | Password attempts unthrottled | Server controls with observable legitimate-user recovery and abuse tests. No closure evidence. |
| P1-21 | CI lacks release-quality gates | Build/test/security/supply-chain checks on the candidate artifact; failure must prevent release. No closure evidence. |
| P1-22 | Release controls are mostly specifications | Named independent review, artifact provenance, operative runbooks and release authority. No G5–G7 evidence established. |
| P1-23 | Proxy loses retry/concurrency headers | U2 local forwarding and 11 recorded unit tests. Optional forwarded headers do not enforce idempotent/concurrent-safe module commands. |
| P1-24 | Renderer defaults to wildcard permissions | Fail-closed rendering plus authoritative server field/action checks. Still present at `DictionaryRenderer.tsx:105`. |
| P1-25 | Offline queue not scoped per user | Tenant/user/device isolation, sign-out handling, idempotent sync and conflict/recovery evidence. Still open. |
| P1-26 | Page/gateway gaps and hidden fallbacks | Register actual allowed routes, enforce access, surface dependency failure; remove silent dictionary fallback. Visibility changes alone do not close this. |
| P1-27 | Scope/WI identity drift | Owner's all-phase decision updates current intent; reconcile original requirements, reserved WI IDs and unresolved scope records. |
| P1-28 | Self-acceptance and unsupported standards claims | Independent technical, domain and applicable legal review; no compliance label inferred from a benchmark or passing test. |
| P1-29 | Identity/control-plane production gate open | Complete required identity, recovery, external configuration and independent evidence for WI-OI-013. |

### 3.2 Additional metadata findings and proposal corrections

These are supplemental IDs for this report, not extra independently deduplicated P0/P1 totals.

**M-01 — Declared dictionary behavior is not executed. Confirmed source gap; high priority.**

`packages/contracts/src/configuration/dictionary.ts:144,216–218,242–259,306` declares resolver keys, conditional
visibility/read-only/required rules, parent relationships, search/filter/sort and action visibility. The current
`packages/configuration-react/src/DictionaryRenderer.tsx` does not consume those capabilities. Its action handler
at line 341 calls an optional callback; it does not implement a business command. It draws tabs/forms but not
bound parent-child records, a server-paged grid or resolved remote lookups. A field existing in the contract or
compiler is not evidence that a tenant can use it.

Repair disposition: extend the existing contract/compiler/renderer and reject unsupported published capabilities
until they execute safely. Give each supported capability a persisted round-trip and permission test. Do not
introduce a second parallel `WindowV1`/`TabV1` model without a versioned mapping to existing `DictionaryViewV1`
and related types.

**M-02 — Weak adapter owner validation and placeholder Finance methods. Confirmed source gap.**

Inventory line 255, Orders line 295 and Procurement line 311 of their control-plane configuration adapters check
the owner type and nonempty identifiers; they do not look up the record or its tenant/org scope. Finance's adapter
at lines 257–277 ignores tenant/entity identity for validation, returns `{}` from its read method and has an empty
write method. These methods are not evidence of domain extension persistence. This finding alone does not prove
that all configuration writes use those methods or that a cross-tenant exploit is reachable; the complete service
call chain and negative tests must establish that.

Repair disposition: module-owned, authorized resolution and persistence through registered adapters. Make
unsupported writes fail explicitly. Preserve the distinction between a tenant's custom schema and values belonging
to a particular business record.

**M-03 — Renderer validation fails open and generic numbers risk precision loss. Confirmed source behavior.**

`DictionaryRenderer.tsx:41,76` returns true for missing/unknown leaf conditions, and line 105 defaults permissions
to `['*']`. Line 306 converts numeric input with `Number(...)`. The first two are unsafe runtime defaults; the last
is a precision concern when exact monetary/quantity extension fields use this control. It is not evidence that
every core ledger uses floating point: Inventory has exact-decimal code and Finance uses BigInt paths.

Repair disposition: validated supported expressions, deny-by-default permissions, explicit error states and
contract-defined exact representations for money/quantity. The server remains authoritative for all validation
and permissions. Fixing a React default alone cannot secure a command.

**M-04 — ADR-0033 risks replacing an incomplete framework with a second, overly broad framework. Design risk.**

The untracked [ADR-0033](../../architecture/ADR-0033-metadata-driven-windows-document-lifecycle-and-posting.md)
records owner acceptance in direction and pending independent Architecture/Security review. It has useful goals:
published windows, actual actions, shared transition infrastructure and posting consumers. Its blanket supersession
of hand-coded screens and new generic record API need boundaries before implementation is treated as settled.

Metadata can govern entity fields, layouts, permissions, references and registered actions while specialized
components implement scanning, map interaction, work-order execution or offline capture. Handwritten React and
typed TypeScript models are not defects by themselves. Fake business data and bypassed domain rules are defects.
The owner can require metadata-governed screens without requiring every interaction to become a generic CRUD form.

A record API is acceptable as a typed dispatcher to allow-listed module adapters and domain commands. It must not
be arbitrary CRUD against canonical tables. [ADR-0019](../../architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md),
line 35, already prohibits a generic PATCH-any-table API. Retain that invariant.

**M-05 — Universal lifecycle and posting wording overstates the correct business invariant. Design risk.**

ADR-0033 D2 proposes one common state list for invoices, stock documents, work orders and timesheets. Reusable
transition, authorization, idempotency, concurrency, audit and transaction primitives are valuable. Each document
still needs its own valid transition graph, guards and reversal semantics; manufacturing execution and financial
posting do not have identical state requirements. An absent shared package does not by itself prove a module's
existing state machine is wrong.

ADR-0033 D3 says every completed document posts. Its companion
[action specification](../../architecture/MODULE_ACTION_OUTCOMES.md) already marks quotations and sales orders
as no-posting, and distinguishes financially relevant documents. Resolve this contradiction. Non-posting
operational documents must be explicit; commitments may be a separate ledger/policy. Apply period, credit and
budget checks where the domain requires them, rather than making all of them unconditional for every document.
Do not claim local completion and a journal in another owning module commit in one ACID transaction.

**M-06 — U2 goal and acceptance wording exceed its recorded coverage. Confirmed documentation contradiction.**

[WI-OI-120c](../../../.pi/tasks/WI-OI-120c.md), line 9, promises every command saves exactly once, while its acceptance
checkbox and [.pi/work/WI-OI-120.md](../../../.pi/work/WI-OI-120.md), line 287, explicitly defer request-level idempotency
for Inventory, Orders, Procurement and Finance to F1. The local source-journal unique index addresses a valuable
subset. Header forwarding and journal dedupe do not establish all-command idempotency.

The recorded 39/39 module-host HTTP proof is a meaningful improvement over SQL-only proofs. It does not show all
commands, all tenants/org scopes, browser entitlements or full posting convergence. Keep both the credit and the
limit visible. Align the card's goal/checkbox with demonstrated scope before closing it; no code rollback follows
from this finding.

**M-07 — Three-tier master-data concept is useful; the proposed storage/ownership rule is not adopted architecture.**

The supplied proposal introduces system Client 0 and a single shared schema. GigaLibs deliberately uses
module-owned schemas and explicit tenant-shared scope, rejecting magic Org 0 in ADR-0018 and system-wide product
records in ADR-0021. Module-owned schemas shared by tenants are compatible with SaaS; tenant onboarding must not
create a separate schema per tenant to satisfy metadata customization. No tenant-triggered DDL was established
by this follow-up, so it must not be reported as a discovered defect.

Separate platform reference catalogue, versioned industry templates and tenant-owned operational masters by
explicit ownership and access policy. Catalogue UOMs currently belong to the tenant under ADR-0021; changing that
requires an explicit contract/ADR change, not silently adding system records. System reference data can evolve
through governed versions; immutable published versions do not mean reference values never change.

Provisioning across independently owned modules needs durable, idempotent steps and observable completion,
failure and retry. A single cross-module database transaction and an under-two-second outcome are unproved
requirements in the pasted proposal, not existing guarantees. Archive/merge/delete policy must account for
references, historical documents, retention and audit; zero purchase orders alone is not sufficient deletion proof.

**M-08 — Precision, RLS and event claims in the proposals need narrower definitions.**

- RLS is a database policy, not hardware or physical tenant separation. Tenant-bearing tables need enforced
  policies and non-bypass runtime roles; system catalogue and migration-ledger tables need their own explicit
  access policy. A universal `tenant_id` on every table is not an adequate design review.
- Money needs exact arithmetic, currency scale and deterministic rounding. Quantities can use exact decimals;
  every quantity does not have to be converted to monetary minor units. JavaScript `number` used for UI page
  counts or geospatial approximations is not automatically a financial defect.
- The claim that GigaLibs has no event relays is false. Six operational edges are statically wired in the baseline.
  The valid finding concerns the ERP event chain. Shared signed relay and inbox receipt code already exists in
  `packages/module-sdk/src/outbox-relay.ts` and `inbox-receipts.ts`.
- Outbox delivery is retryable and may repeat. The required invariant is an idempotent business effect per stable
  source identity/version, not an unsupported claim of exactly-once network delivery.
- A raw SQL test is useful for constraints/migrations. It becomes misleading when labeled proof of a browser/API
  outcome it never executed. Keep it and add the missing level of test.

### 3.3 Repair without unnecessary replacement

| Asset | Disposition | Required boundary |
| --- | --- | --- |
| Module registry, manifests, generator and module host | Reuse | Fix source manifests and regenerate; verify registration, migrations and route reachability together. |
| Signed context, BFF and module guards | Reuse and harden | Real tenant/org/entitlement/permission checks on each path; revocation propagation and negative tests. |
| Domain contracts, tables and services | Preserve where sound | Target defects at the existing command boundary; retain IDs/history; forward migrations for schema changes. |
| Dictionary contracts, compiler and renderer | Extend | Published version pinning, real record binding, lookups/actions and server enforcement; no competing metadata model. |
| Configuration adapter registry | Evolve | Module-owned contributions and verified domain record resolution; explicit handling of unsupported operations. |
| Existing API-backed Organization/Catalogue flows | Use as references | Re-test their complete paths; do not copy an unsafe fallback just because the rest is better integrated. |
| Module SDK relay and inbox receipts | Reuse | Registered schemas and source authorization, transactional receipt/effect, multiple-consumer routing, retries and reconciliation. |
| U2 transaction/outbox/migration repairs | Preserve and independently review | Retain good fixes; narrow completion claims; do not overwrite another implementation's work to satisfy a new framework. |
| Static ERP arrays and fake success stores | Replace the affected paths | Persisted tenant-scoped results; no hidden fallback to sample business truth. Isolated tests may still use visible fixtures. |
| Parallel stock, invoice, party and asset writers | Reconcile ownership | Compatibility adapters, mappings and migration/reconciliation proof; no blind deletion of overlapping modules or data. |
| Existing unit/SQL tests | Retain as component evidence | Add authenticated HTTP, browser, integration, failure/retry and release-level proof for the outcomes they cannot cover. |

The design boundary should read:

`published metadata + verified context → UI/registered action → owning module command → local transaction
(domain effect + audit/outbox) → signed delivery → consumer transaction (inbox receipt + effect) → reconciliation`.

Metadata governs allowed configuration and interaction. The owning domain enforces business truth. A completed
operation may await asynchronous accounting; that state must be visible and reconciled, with retry, rejected
posting and close-period behavior defined. This preserves the existing modular architecture.

## 4. METADATA & MASTER DATA COMPLIANCE SCORECARD

Ratings are qualitative and evidence-based: **usable foundation**, **partial**, **failing**, **not established**,
or **design correction required**. They are not percentages or release gates.

| Capability | Rating | Evidence / missing proof |
| --- | --- | --- |
| Typed domain ownership with bounded extensions | Usable foundation | ADR-0002/0019; relational core plus approved extension storage. Arbitrary runtime table CRUD would violate it. |
| Dictionary contracts and compilation | Usable foundation, incomplete adoption | Existing entities/fields/references/views/actions and compiler. Publication is not proof that every runtime feature executes. |
| Forms, grids, lookups and record actions | Partial | Form renderer exists; conditional capabilities, server paging, bound records and executed actions remain incomplete. |
| Runtime permission/validation defaults | Failing | Wildcard renderer default and fail-open unknown conditions; authoritative server checks must be independently tested. |
| Tenant custom-field persistence | Partial / not established per owner type | Configuration infrastructure exists; four workspaces keep local values and Finance adapter methods are placeholders. |
| Published-manifest fidelity | Failing for claimed ERP experience | Constant manifests in four workspaces and silent fallback elsewhere; no complete deployed customization round-trip proof. |
| Three-tier master ownership | Design correction required | Good conceptual separation, but Client/Org 0 and shared-system UOM proposal conflicts with current ADRs. |
| Canonical party/product adoption | Partial | Masters exist; free text and unvalidated references in consumers prevent trusted shared business identity. |
| Master immutability/archive/merge | Not established comprehensively | Need entity-specific reference and historical snapshot tests; cannot certify from the proposed generic deletion rule. |
| Tenant provisioning without per-tenant DDL | Architectural intent supported; complete journey unproved | ADRs prohibit tenant runtime DDL; provisioning event lacks a complete producer/consumer chain in baseline. No measured two-second guarantee. |
| Tenant and organization isolation | Partial, with stop-ship exceptions | Signed SDK/RLS foundations coexist with caller-tenant endpoints, nontransactional GUC binding and incomplete org scope. |
| Shared document behavior | Partial | Domain services exist; cross-cutting command safety inconsistent. A shared lifecycle kernel must preserve domain-specific graphs. |
| Operational event-to-ledger posting | Failing for complete ERP journey | No registered ERP relay/consumer chain established; U2 local outbox fixes do not provide it. |
| Exact money/quantity | Partial | Finance BigInt and Inventory exact decimal are reusable; other arithmetic and renderer conversion require scoped fixes. |
| Evidence integrity and repeatable build | Improving, incomplete | U1 reproducibility and proof isolation; U2 recorded HTTP tests. Missing full-path, independent and production evidence remains. |
| Current production viability | NO-GO | Security, truthfulness, complete journeys, recovery, release artifact and G5–G7 gaps remain. |

### 4.1 How an individual WI/action should be judged

Review each WI, but accept it against a business journey as well as its module boundary. A module-only success
cannot certify a cross-module outcome. Shared ownership/security/metadata contracts must be settled consistently
so individual repairs do not create competing implementations.

For each business action, the evidence record needs the following fields. A missing field is an explicit gap,
not an invitation to assume success:

| Review point | Required evidence |
| --- | --- |
| Business value and scope | Named user, action, measurable result, WI, preserved FR-01–FR-16 linkage and applicable NFRs. |
| Actual entry point | Page/control, expected role, BFF route, module endpoint and deployed entitlement. |
| Domain authority | Owning service/table; legal transitions; verified party/product/organization references. |
| Security | Authentication, tenant/org/object/field/action permissions and negative tests. |
| Persistence | Commit and reload; no process-memory/local-storage substitute for business truth. |
| Command safety | Stable retry identity, same-key/different-payload rejection, concurrency conflict and atomic rollback evidence. |
| Downstream effect | Named event, started relay, authorized consumer, dedupe and reconciliation; or explicit non-posting/no-consumer justification. |
| User failure/recovery | Loading/empty/denied/validation/conflict/dependency failure, retry and correction behavior. |
| Monetary/quantity truth | Exact representation, rounding and conservation; domain-reviewed expected values where applicable. |
| Operations | Audit/correlation, useful metrics, migration/recovery proof and durable failure visibility. |
| Release acceptance | Tests run against the candidate artifact, independent review, named human acceptance and production observation when required. |

This supports fixing work item by work item without losing the end-to-end result. The first useful demonstration
is a real, authorized transaction that survives reload and retry, produces its expected downstream effect and
reconciles. Another complete-looking module screen is not equivalent evidence.

### 4.2 Matters that remain decisions, not findings to code around

- Confirm the corrected meaning of metadata-driven screens, common lifecycle primitives and generic adapters
  before treating ADR-0033 as final implementation detail. Owner direction is recorded; independent review is pending.
- Resolve authority for vendor bills/payables, inventory and operational versus financial assets. AR's proposed
  customer-invoice ownership needs actual adoption by Orders and existing control-plane flows.
- Name the independent Product, Security, QA, Accounting and applicable Legal reviewers and release authority.
- Existing D5 proof-data cleanup, D6 credential rotation and CMMS migration disposition remain governed separately.
  This report does not authorize deleting data, rotating credentials or modifying committed migrations.

The user requested investigation before deciding how to proceed. No master implementation prompt, new product
architecture, executable remediation plan or product patch is adopted by this report. Its purpose is to make that
decision reviewable while preserving the useful work already built.
