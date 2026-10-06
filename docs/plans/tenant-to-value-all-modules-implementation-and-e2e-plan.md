# Tenant-to-value implementation and end-to-end acceptance plan

Date: 2026-10-06. Programme: WI-OI-120. Status: **Proposed; implementation approval required**.
First slice: [WI-OI-120m](../../.pi/tasks/WI-OI-120m.md). This plan does not authorize deployment,
customer-data writes, new architecture, or certification. The existing remediation backlog remains authoritative
for repair ownership; this document adds tenant-to-value sequencing and acceptance coverage, not a competing backlog.

## 1. Outcome and boundaries

An entitled customer can configure its organization, invite appropriately scoped users, enable its purchased
modules and complete real business work. Start with CMMS/EAM; retain all 23 committed modules in the programme.
Do not label CMMS as a complete EAM offering until its promised asset-lifecycle capabilities are accepted.

Reuse identity/tenancy, organization, module registry/entitlements, Configuration Studio, dictionary compiler,
renderer, signed gateway, module SDK, domain services and event infrastructure. Follow ADR-0002, ADR-0019 and
ADR-0033: no parallel metadata engine, tenant DDL, arbitrary table CRUD or universal document state graph.
Specialized maps, scanning and execution components remain valid within governed screens.

Default platform services: tenant identity, organization/scope, users, permissions, shell, configuration, audit,
entitlement enforcement and operational controls. They need not appear as separate customer applications.
Business modules are selectively entitled. Each module must declare required versus optional dependencies;
a technical dependency is not automatically a separately purchased application. Do not enable Finance or all
ERP modules merely to make CMMS setup pass. Prove the minimum dependency set before implementation.

Separate organization/accountability, physical location and asset composition. Tenant terminology can change
labels, not identifiers, ownership or permissions. No global rename or hierarchy replacement is assumed.

Preserve protected CMMS import/export files, existing tenants/data, untracked work and the running web on 5180.
One module in Build at a time. Do not interrupt an active approved repair; schedule this card at handoff.

## 2. Evidence baseline and discovery

Inspected: 23 git-tracked `modules/*/module.yaml` manifests; current NOW; U19a/WI-OI-120h; EAM-001–005;
existing e2e configuration/spec inventory; requirements and SDLC/completeness standards. No new browser,
database, provider or runtime certification was executed to create this plan.

NOW records CMMS route/migration repairs and newer U12 deployments, but retains older contradictory runtime
sections. Some cards and the programme registry also retain older handoffs. Treat these as reconciliation gaps,
not evidence of current failure or acceptance. Capture checkout commit, dirty changes, candidate image digests,
actual migrations, enabled modules and configuration versions before each executable run.

Discovery deliverables, before claiming exhaustive coverage:

1. Join module manifests, pages/navigation, visible controls, BFF routes, controllers, domain commands, jobs,
   events, phase deliverables and WI requirements into a versioned action register.
2. Map each row to an existing repair card and test, or record a missing test/implementation explicitly.
3. Include non-menu operations: webhooks, background jobs, imports/exports, scheduled tasks and service inboxes.
4. Classify every capability as implemented/unverified, verified at a named layer, unavailable, contained,
   never built, or approved non-applicable. Unavailable is not passed or silently removed from coverage.
5. Reconcile the existing audit functional-action/event matrices rather than recreate their evidence from memory.

Required action-register columns:
`action ID | module | WI | FR/NFR | actor | entitlement | org/place/object scope | page/control | route/command |
owner/data store | transition | downstream event/effect | expected values | test IDs/layers | candidate/version |
status | evidence | defect | reviewer`.

Use stable test IDs such as `CMMS-WO-COMPLETE-001`; do not renumber source WIs or FR-01–FR-16. Preserve FR-17
and its invoicing refinements where applicable. Exact per-action requirement mapping is a discovery deliverable,
not satisfied by attaching every FR to every test. Include SEC, DATA, REL, UX, OBS, PERF, OPS and GOV controls
as applicable. All expected results must be independently specified, not calculated by the implementation under test.

## 3. Delivery sequence and approval gates

| Stage | Implementation work, after its card is approved | Exit evidence |
| --- | --- | --- |
| A: reconcile and scope | Read-only CMMS tenant-path assessment; action/dependency/ownership register; exact gap cards | Every first-slice action traced; environment and authority known |
| B: shared acceptance harness | Extend existing Playwright harness, personas, isolation preflight and artifact manifest | Wrong environment refused; clean setup; two-tenant negative test; no global admin shortcut |
| C: CMMS first value | Smallest repairs for tenant setup, entitlement, scope and request/work-order lifecycle | Full CMMS-only customer journey passes with reload and audit |
| D: complete CMMS | EAM-001–005 capabilities, maintenance scheduling, spares and optional integrations in bounded cards | Every inventoried CMMS action/state has evidence or explicit blocker; no critical open gap |
| E: remaining modules | One approved module card at a time in dependency order, reusing U4–U21/U29 | Module action coverage, shared regression and independent review |
| F: cross-module journeys | Existing U22/U23 integration repairs and acceptance | Real producer-to-consumer effects, replay/failure recovery and reconciliation |
| G: release readiness | Recovery, load, security, provenance, runbooks and authorized rollout | G5/G6 human gates; G7 only after actual production observation |

Stage A is the proposed immediate card. Stage B/C implementation cards are derived from observed gaps, with
explicit paths, requirements and acceptance before approval. No blanket authorization to modify every module.
Security stop-ships take precedence over this convenience ordering. A missing optional dependency blocks the
affected journey, not an excuse to fabricate its result or require unrelated modules for CMMS-only use.

Suggested module order after CMMS: shared master-data gaps → Inventory/Workforce → Procurement/Orders →
Finance/AR/Spend/Tax/FX → Connector/Geo/Analytics → remaining automation/provider modules. Adjust for confirmed
dependencies and existing approved work. This does not postpone critical security remediation until a module's UI turn.

## 4. First customer: CMMS/EAM acceptance

Use tenant A (CMMS-only minimum dependencies) with two sites and scoped areas, plus tenant B as an isolation
and configuration contrast. Map personas to actual supported roles/permissions; do not invent privileged test roles.
Personas: platform provisioner, tenant administrator, site-A supervisor, site-B supervisor, technician and read-only
auditor. Separate browser contexts and sessions. Platform provisioner must not be the business-work test actor.

| Journey | Positive acceptance | Negative/failure acceptance |
| --- | --- | --- |
| Provision and enable | Tenant created; minimum CMMS dependencies activated; readiness visible | Unentitled module navigation and direct API denied; partial activation visible and retryable |
| Organization/locations | Create supported site/area hierarchy; assign scoped users | Cycles, invalid parents, cross-tenant references and unauthorized hierarchy edits rejected |
| Assets | Register asset, supported classification/specs and location; reload and search | Invalid references, duplicate identity, unauthorized updates and stale versions rejected |
| Maintenance | Request → valid work-order creation/assignment → execution → completion → history | Invalid transitions, wrong assignee/site, missing required evidence and double submission handled |
| Scheduled maintenance | Configure supported job plan/checklist and due-work path | Repeated scheduling does not duplicate work; unsupported automatic triggers remain explicitly blocked |
| Evidence | Actor, scope, transition, timestamps and correlation reconstruct the outcome | Failed changes do not produce false completion or partial business effects |
| Configuration | Supported location label and one asset extension field published, saved and reloaded | Tenant B unchanged; missing grants fail; upgrade preserves overlay; unsupported slots are gaps, not fake local storage |
| Scope change | Supported reassignment/session revocation reflected on subsequent access | Previously authorized session cannot continue forbidden actions; cache and export paths covered |

Complete CMMS coverage must then include the existing EAM cards: spatial/CAFM and CAD/BIM references (001),
asset hierarchy/specification/status effects (002), manuals/checklists (003), telemetry/meter-driven PM (004),
storerooms/parts/Workforce relay and cost roll-up (005). Verify contained capabilities before attempting activation.
Include existing import/export behavior in acceptance without editing protected baseline files; a defect there
requires separate owner authorization. Add attachments, filters/paging, history, delete/archive guards and reports
where present. Do not assume every work order requires approval: derive transitions from the actual domain contract.

Materials are a decision gate: establish stock authority and existing issue/return semantics before linking CMMS
and Universal Inventory. Preserve historical IDs; no duplicate stock deduction. Finance asset ownership and Workforce
assignments similarly require explicit contracts. CMMS-only work must not depend on optional financial posting.

## 5. All-module acceptance inventory (23 registered modules)

These are minimum journey families, not a claim that each action is implemented. Expand every family into the
action register. For missing features, record NOT BUILT and map to approved remediation; do not write a passing
test for a notice page as a substitute for the business outcome.

| Module | Minimum end-to-end journey families |
| --- | --- |
| physical-operations-cmms | Section 4 and EAM-001–005; optional dependencies tested separately |
| gigaops | Resources, assignments, shifts, attendance/time, approvals, expenses and offline sync where promised; user/device queue isolation |
| product-catalogue | Product/UOM/classification, price versions/entries, maker-checker, lookup adoption, import/export and archive/reference safety |
| universal-inventory | Warehouse/location/item/lot, receipt/issue/transfer/adjustment/reservation where supported, barcode resolution, balances and stock conservation |
| universal-procurement | Requisition/approval/PO, receipts, bill matching, exception handling, budgets/SoD and payable handoff |
| universal-orders | Customer/product selection, quotation/order, allocation/dispatch/cancel, shortage handling and invoice handoff |
| financial-operations | GL setup/journal/second-person approval/reversal; Treasury import/matching; fixed assets/depreciation; consolidation/elimination; costing; budgeting; close/forecast |
| accounts-receivable | Customer/draft/issue/credit, delivery, payment allocation/reconciliation, aging, webhook replay and FR-17 billing refinements |
| spend-management | Expense capture, receipt, approval/rejection, settlement and payable/GL reconciliation |
| tax-configuration | Effective-dated setup, governed rates, transaction calculation, rounding, exemption and downstream adoption |
| multi-currency | Rate source/date, conversion, revaluation/translation with reviewed expected amounts; no fabricated adjustment |
| universal-connector-hub | Credentials, connection readiness, initial/delta pull, mapping, webhook validation, checkpoint/replay, schema drift and revoke/disconnect |
| geospatial | Place hierarchy/boundaries, spatial references/maps, scoped queries and authorized event propagation |
| analytics-studio | Source → mapping → dataset → approved measure → report/dashboard/export; freshness, lineage and synthetic-data exclusion |
| universal-rule-pro | Scoped rule draft/validate/publish/evaluate, version selection, forbidden edits and durable outcome |
| workflow-studio | Design from supported nodes, publish/start, task approval, pause/cancel/retry and restart recovery where implemented |
| universal-data-studio | Contract version/mapping validation, incompatible input rejection, lineage and enforcement in a consuming flow |
| saga-orchestrator | Supported orchestration, persisted progress, duplicate delivery, compensation and operator recovery |
| autonomous-recovery-studio | Authorized recovery request, policy/approval, bounded execution, durable receipt and failed-recovery visibility |
| communications | Send via configured provider, receipt/delivery/failure, retry/reconciliation and authorized history; no simulated delivery |
| esignature | Document/request/signer journey, provider callback, declined/expired states, final artifact and tamper/audit checks |
| document-scanner | Upload → extraction → human correction → canonical document; unsafe file/low-confidence handling and duplicate prevention |
| ontology | Scoped entity/relation lifecycle, valid references, permission-safe query and actual downstream use |

Additionally cover shared/control-plane capabilities even though they are not separate registered module folders:
identity/session/SSO/SCIM where supported; tenant provisioning; Organization; Parties and role adoption;
Configuration Studio publication/activation; entitlements; Governor/quotas; audit/evidence; exception recovery;
usage/billing; outcome catalogue and Demo Lab isolation. Preserve applicable FR-01–FR-16 requirements and record
unbuilt controls as gaps. Exclude parked FastAPI and quarantined/untracked prototypes from acceptance claims.
Manufacturing, Projects, RMA and mobile requirements remain U24–U27 future implementation scope, explicitly
tracked but not misrepresented as part of today's 23 implemented modules.

## 6. Cross-module acceptance (existing U22/U23)

- Tenant → enable module → publish configuration → first business action, without developer database intervention.
- Organization/Parties/Catalogue changes adopted safely by consumers; archived masters cannot create invalid work.
- CMMS assignment → Workforce execution → time/history; materials issue/return conserves authoritative stock.
- Procurement → inventory receipt → matching → payable → GL/payment, including partial receipt and reversal.
- Orders → stock reservation/dispatch → AR → payment → GL, including shortage, cancellation and credit.
- Inventory → costing → ledger/margin, with quantity/value reconciliation and exact rounding.
- Budget → commitment/reservation → actual/release → period close; overspend and late-event behavior.
- Fixed assets and operational assets link without two competing masters; depreciation/disposal and financial history.
- Group consolidation from accepted entity books, reviewed eliminations and close evidence.
- Connector → Geo/Analytics → rule/workflow → authorized action → durable receipt and reporting.

Every edge names producer, event/schema/source identity, relay, consumer, permission, dedupe key, failure queue
and reconciliation query. Use real producers: inserting matching SQL rows in both modules is not convergence proof.
Interrupt consumer availability in isolated infrastructure, restore it and prove eventual effect once, visible
pending/rejected state and safe replay. Network delivery is at least once; require idempotent business effects.

## 7. Playwright and supporting verification design

Extend `e2e/` and its existing config, not a parallel test framework. Reuse appropriate existing specs for
organization-admin, authenticated personas, cross-tenant isolation, inventory-business-flow, approvals, add-new,
general-ledger, packs, connector-pull, connector-to-analytics and places-map. Audit each spec for skipped paths,
API shortcuts and weak assertions before counting it as acceptance. Screen inventory tests are smoke coverage only.

Proposed additions: shared tenant/persona fixtures and environment guard; `cmms-tenant-onboarding`,
`cmms-maintenance-journey`, `cmms-scope-isolation`, `cmms-configuration`, `cmms-eam-extensions` spec groups;
later per-module groups and cross-module journey groups. Final paths follow existing conventions in approved cards.

Safety requirements:

- Never use the config's localhost:5180 default as authorization. Require explicit target, isolated environment
  identity, tenant allow-list and run ID before writes. Verify actual destination and non-production identity.
- Default automated certification uses disposable isolated services/databases. Existing-instance UAT requires
  separate owner authorization, dedicated test tenants, business data through UI and exclusion from value reporting.
- Identity/bootstrap fixtures may use approved admin APIs in the isolated environment, but may not bypass the
  onboarding behavior under test. No SQL to create claimed business outcomes; read-only independent DB assertions
  supplement UI/API checks. Bootstrap limitations remain visible.
- Per-persona storage state; never commit tokens/passwords. Redact traces, uploads and provider payloads; set
  evidence retention/access. No blanket destructive cleanup; remove only verified run-owned resources if approved.
- External actions run against provider sandboxes with explicit credentials/authority. Test doubles may test
  timeout behavior but cannot certify delivery. Missing provider configuration means BLOCKED/NOT RUN.

Assertion requirements for every applicable action:

1. Real UI input and expected authorized request; no route interception supplying success fixtures.
2. Correct persisted values after reload/new session; fresh read, not optimistic UI alone.
3. Role, tenant, org/place, object and field denial, including direct API attempts.
4. Required-field/invalid-reference validation, empty/loading/error/stale/conflict states.
5. Double click/retry, same key with changed payload, competing users and partial-failure atomicity.
6. Audit, downstream effect and reconciliation; assertions on exact expected quantities/amounts.
7. Accessibility (keyboard/focus/labels and axe), supported viewport, timezone/locale/unit behavior where applicable.
8. Bounded polling on domain state, not fixed sleeps; fail on unexpected console errors/5xx; retries retain first
   failures and flakiness is triaged, not converted silently into acceptance.

Playwright is not the entire assurance programme. Pair it with real-database HTTP/security tests for direct-port
access/RLS/pool reuse, unit/property tests for arithmetic/state guards, event-contract tests, fault injection,
fresh/upgrade migrations and restore rehearsal, performance/load tests, secret/dependency scans and independent
domain review. Do not claim browser tests prove backup recovery, accounting correctness or cryptographic security.

## 8. Execution, evidence and completion

Per change: targeted tests plus `pnpm verify`. Documentation-only work uses `pnpm verify --audits`.
Browser suites run explicitly through the existing `@gigalibs/e2e` package against an authorized target; do not
assume `pnpm verify` runs Playwright. Proposed CI layers: fast affected-journey checks on changes; scheduled full
isolated module/cross-module regression; candidate-artifact migration/provider/recovery/accessibility/load suites.
Exact commands/env names are finalized when the environment guard and selected specs exist.

Each evidence bundle contains run ID/time, source commit and dirty diff if any, image digests, migration ledger,
manifest/config versions, test identities (not secrets), commands, test results, trace/screenshots, business record
and correlation IDs, independent persistence/reconciliation evidence, failures/skips and reviewer disposition.
Tests must exercise the candidate artifact; stale results do not certify a later image.

Statuses: NOT ASSESSED, READY TO TEST, PASS, FAIL, BLOCKED, NOT RUN, or approved N/A with rationale. Report
counts against a dated action-register denominator, separately for modules, shared controls and integration edges.
No percentage based on document lines or number of rendered pages. Skips and contained capabilities remain visible.

Exit per module: all promised actions/states traced and verified; no unresolved P0/P1; persistence/security/retry/
recovery checks pass; dependencies accepted; independent QA and applicable Security/domain reviews recorded.
Product acceptance and release authority remain named humans. Agent implementation is not self-certification.
Full-programme acceptance requires all included modules plus shared and cross-module journeys; CMMS first-value
passing alone is only a milestone. Production stays NO-GO until SDLC G5–G7 evidence/authority is satisfied.

## 9. Decisions and immediate next action

Approve WI-OI-120m for **read-only CMMS assessment and exact repair/test cards**, not all-module product edits.
It must resolve required CMMS dependencies, stock/place/asset ownership and test environment before write tests.
Named independent reviewers and release authority remain D7; this plan does not resolve D5 cleanup or D6 rotation.
No new architectural decision is assumed. Escalate any actual ownership/contract change for its own approval.
