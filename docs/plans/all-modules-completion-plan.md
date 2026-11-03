# All modules: register, corrections and completion plan (web and mobile)

Date: 2026-11-03. Requested by the owner: "consolidate all the modules that are in the current system and give me the
implementation plan and add into the next item to work and hand over to any other agent to complete the entire work
including the mobile scopes clearly and clear the codex or cursor confusions from their assessments".

**Where this sits.** `AGENTS.md` sets the rules; [plan v3](gigalibs-execution-plan-v3.md) is the order of all work; the
[one ordered queue](master-data-foundation-execution-plan.md#6a-the-one-ordered-queue-owner-2026-11-03) (§6a) is the
list every agent works, one card at a time. This document is the **module register** (it replaces plan v3 §3 "Where we
stand" and §7 "Module inventory" for module status, both dated 2026-10-13), the **mobile scope** of every module, the
**corrections** to earlier assessments, and the **completion order** after the queue's current items (§7). Every fact
below was read from the repository at `bd852946` (`~/dev/gigalibs-rounds`, `feat/frontline-suite`), the mobile
repository at `508620a` (`~/dev/gigalibs_mobile`, `main`) and the running UAT containers (names and image tags only).

## 1. How to read a status

| Word | Meaning | Where it is kept |
| --- | --- | --- |
| **Built** | The code exists and `pnpm verify` passed (plan v3 rule 8) | `.pi/WORK_ITEMS.md` |
| **Running on UAT** | The code is in the release UAT runs. Not yet a status: it still needs a read-only check | This register |
| **On UAT** | Deployed **and** verified there; the row names the release (`audit:sdlc` checks it) | `.pi/WORK_ITEMS.md` |
| **Done** | The Done checklist (plan v3 §2) is complete and the owner's acceptance is recorded | `.pi/WORK_ITEMS.md` |
| Catalogue **readiness** | Whether a customer may open the module, **not** whether it is built: `AVAILABLE` (released), `REVIEW` (shown), `PLANNED` (hidden from customers; shown on UAT through the UAT preview switch, `apps/workflow-platform/lib/module-access.ts:91`), `CONTAINED` (hidden everywhere) | `modules/*/module.yaml` `spec.catalog[].readiness` |
| Catalogue **maturity** | How much evidence stands behind it: `CONCEPT` … `CORE_IMPLEMENTED`, `INTEGRATED_CANDIDATE`, `CERTIFIED`, `PRODUCTION_PROVEN` | same file |

**The release UAT runs:** `38aa9017` (release worktree `~/dev/gigalibs-release-5180b`). `bd852946` (milestone A) is being
deployed by the owner on 2026-11-03. UAT runs these services: `web`, `api` and `kernel-worker` (control plane),
`module-host` (12 modules, below), `cmms-api`, `workforce-api`, `geospatial-api`, `analytics-api`, `connector-hub-api`,
`iot-api`, PostgreSQL and Redis. It does **not** run `ar-api`, a Workflow Studio service, or any `CONTAINED` module.

## 2. Corrections to earlier assessments

Agents read these before trusting an older document, hand-over or chat answer.

| # | What was said | By | What is true | Evidence |
| --- | --- | --- | --- | --- |
| 1 | The mobile app compiles only a Shift Logbook feature | Codex (workforce answer, 2026-11-03) | It compiles **11 field features** plus profile: inspection rounds, calibration, commissioning, visual spares, shift logbook, work instructions, equipment check (fleet), report a problem, safety, contractor pass, permits and LOTO, served by **42** `/mobile/v1` routes. What is true is that **Workforce itself** is mostly planned on mobile | `gigalibs_mobile/apps/operations/src/navigation/compiled-features.ts`; `apps/workflow-platform/lib/mobile-bff.ts` `MOBILE_ROUTES` |
| 2 | A department supervisor's booking lacks a check that the worker is in their unit | Codex | Understated. (a) A Workforce role **cannot** be given at a unit or place: the platform refuses with `ROLE_SCOPE_NOT_ENFORCED`, because `gigaops` is not in `SCOPE_ENFORCING_MODULES`; only the person's own scope limits them. (b) Inside Workforce, people lists are scoped by assignment, but the **booking candidate list reads every active person** (first 200 by name), booking creation never checks the worker's scope, and requirements, bookings, time and pay are limited by place only, never by unit | `packages/contracts/src/rbac/assignment-scopes.ts:86`; `packages/tenancy-nest/src/role-scopes.ts:75`; `modules/gigaops/apps/api/src/bookings/bookings.service.ts:195`; `.pi/tasks/WI-OI-120ho.md` audit table |
| 3 | Workspace country, currency and time-zone setup "is being built" (WI-OI-153) | Codex | Built and committed (`6c9999c2`), in the milestone A deploy `bd852946` | `.pi/work/WI-OI-153.md` |
| 4 | Repeating store rosters "are not certified end to end" | Codex | They do **not exist**: a requirement is one time window (at most 31 days) with a headcount; there is no shift template, rotation or recurrence | `packages/contracts/src/workforce/index.ts:856–878` |
| 5 | "A broader event-engagement schema exists in source" (implying it can be used) | Codex | It is the **retired** WFO model (`wfo_*` tables, empty; no route reaches them since 2026-10-13, owner "retire all"). Its engagement types (EVENT, ROUTE, VOYAGE, ROSTER_PERIOD, SHOOT_DAY, POST, DUTY_ROSTER) are a design reference only; never revive the tables | `modules/gigaops/db/runtime-foundation/000021_wfo_engagements.up.sql:18`; `modules/gigaops/apps/api/src/wfo-retired.spec.ts` |
| 6 | No governed customer contract or bill rate exists | Codex | True **in Workforce**. **Project Operations** already has projects with a customer and owning unit, labor rate codes, timesheets (per user, task and day) and billing to AR. It is a **second time path, not connected to Workforce** (no relay; the requirement source `PROJECT` is never produced) | `modules/project-operations/db/migrations/`; `config/relay-wiring.json` |
| 7 | Products, Inventory, Procurement, Orders, General ledger and the other module-host modules are "PLANNED" | Readers of the catalogue (several agents) | `PLANNED` is a release label. All 12 module-host modules are built and **running on UAT** (bench screens load) | §1; `apps/module-host/src/hosted-modules.generated.ts` at `38aa9017` |
| 8 | The seven iDempiere modules (WI-OI-122–129) and IoT (130) wait for "the owner's single batch deploy at the end" | Cursor hand-over 2026-10-29; `NOW.md` | Their code is **already in the running release** `38aa9017`. They wait for a **read-only check on UAT**, relay settings for the module host, and the owner's acceptance, not for a deploy | `git merge-base --is-ancestor` of each card's last commit with `38aa9017` (2026-11-03) |
| 9 | The frontline suite (WI-OI-133–143) needs the owner's deploy | `NOW.md`; `FRONTLINE-SUITE-100-DEPLOY-2026-11-02.md` | Platform side **already in `38aa9017`**. What is open is the device proof (WI-OI-165) and the owner's acceptance per product | same check |
| 10 | CMMS M-CM1 needs "release worktree → backup → build → deploy" | `NOW.md` (Group 1) | `9eb14717` is in `38aa9017`. Open: the journey re-run on UAT and the owner's five Done ticks | `.pi/tasks/PHASE-1-CM1-CHECKLIST.md` |
| 11 | `pnpm verify` fails on pre-existing product-catalogue lock, platform-context headers, suspicious-text and undeclared `vitest` steps | `NOW.md` (2026-10-28/29 entries) | Stale. `pnpm verify` passes (19 steps) at `bd852946` | `.pi/work/WI-OI-156.md` |
| 12 | The old "Master Data Hub" is a contained prototype to retire | Plan v3 §7 A row 12 | The new Master data area is WI-OI-152 (Built), generated from manifests | `.pi/work/WI-OI-152.md` |
| 13 | Manufacturing, Projects and Returns are "modules to build" | Plan v3 §7 C | Built (WI-OI-126, 129, 128) and running on UAT | §3 |
| 14 | Status can be read in `~/dev/gigalibs` | Several sessions | `~/dev/gigalibs` (branch `release/convergence-uat-5180`) is an older line holding **other sessions' uncommitted work** (including WI-OI-131 Analytics). Status is read from `~/dev/gigalibs-rounds` only; nobody edits `~/dev/gigalibs` | queue §6a |
| 15 | The mobile capability atlas reviewed producers on the wrong checkout | Codex (atlas, 2026-11-03) | Already corrected in `gigalibs_mobile` `508620a` (producers are in `02b3353a` and later) | `gigalibs_mobile/docs/product/MOBILE_CAPABILITY_WORKFLOW_ATLAS_2026-11-03.md` |
| 16 | A person's manager in the organization chart approves their time | Common assumption | No reporting line exists between workers or positions. A unit has one `managerUserId` (a login), used for nothing else. A timesheet is approved by anyone holding the permission, except the worker and the submitter | `packages/contracts/src/organization/index.ts:107`; `modules/gigaops/apps/api/src/time/time.service.ts:368` |
| 17 | Booking a technician through Workforce lets them execute the CMMS work order | Common assumption | No. CMMS keeps bookings in `work_order_bookings`; "execute own" checks only `assigned_to` | `modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts:738`; `relay/inbox.service.ts:132` |
| 18 | `backup.sh` backs up UAT | Older runbooks | It dumps the stale `gigalibs-postgres`; back up `gigalibs-configuration-local-uat-postgres-1` directly (as every deploy script since 2026-11-03 does) | deploy scripts |

## 3. Module register

31 module manifests (`modules/*/module.yaml`), the platform kernel, and the mobile app. "Mobile now" means compiled in
the app **and** served by `/mobile/v1`; "contained" means app code exists without a compiled route or a server route.

### 3.1 Platform (kernel), in every workspace

| Area | State | Open work | Card or stage |
| --- | --- | --- | --- |
| Sign-in, sessions, MFA, members, roles, invitations | Running on UAT | Delegated and bulk people administration (R13–R14), directory groups and SSO (R15) partly built locally | WI-OI-120p (In progress), plan v3 Phase 3 |
| Organization (units, trees, versions, scope grants) | Running on UAT | Departments → units convergence (T2) | Stage C2 |
| Places (Geospatial identity) | Running on UAT | Jurisdiction fields required for paid work; CMMS spaces onto Places (T3); R5 Geospatial | WI-OI-173, Stage C3 |
| Master data area, reference data, workspace profile | Built (WI-OI-152, 153), in `bd852946` | Packs, import kit, replicas | Queue items 11–13 |
| Relays (26 declared: 20 wired, 6 not wired) | Register and `audit:relays` (WI-OI-160) | The six not-wired relays need owner keys; module-host relays are not configured on UAT | Stage C4 and the owner decision in `.pi/work/WI-OI-160.md` |
| Set-up guide, module requests, UX batch | On UAT (WI-OI-146, 150); WI-OI-147–149, 151 In Progress for owner clicks and journeys | Close by evidence | WI-OI-168 |
| Assistant (Giga Companion) | On hold (owner 2026-10-27) until business modules are complete | — | WI-OI-120bc, after Stage C |

### 3.2 Business modules

| Module (folder) | What it does | Runs | Catalogue | Real state | Mobile now | Mobile next |
| --- | --- | --- | --- | --- | --- | --- |
| Asset maintenance (`physical-operations-cmms`) | Assets, work orders, PM, requests, permits, spares | `cmms-api` | REVIEW | M-CM1 running on UAT, owner Done ticks open; frontline extensions 134–136, 138–140, 142 running on UAT | Calibration, commissioning, spares, work instructions, equipment check, report a problem, permits and LOTO | WI-OI-164 my work orders (needs 163, 169); kiosk tablet (C1) |
| Workforce (`gigaops`) | People, skills, positions, availability, absences, requirements, bookings, punches, timesheets, pay-ready runs, logbook | `workforce-api` | REVIEW | People, availability, absences, bookings on UAT; scope gap (§2 #2); no rosters, client rates or site-based pay | Shift logbook | WI-OI-170 my shifts, clock in/out, my time, absence; supervisor tablet |
| Places & maps (`geospatial`) | Place tree, coordinates, boundaries, time zones | `geospatial-api` | REVIEW | Running on UAT | — (maps feature contained) | Place context inside 164 and 170; maps in C3 |
| Products (`product-catalogue`) | Items, units, categories, price lists; master facts | module host | PLANNED | Running on UAT; master facts in `bd852946` | — (web authoring) | Product scan lookup inside other journeys |
| Inventory (`universal-inventory`), with Material ledger (124) and Landed cost (127) | Warehouses, stock, reservations, ledger, costing | module host | PLANNED | Running on UAT; relays to Finance and Procurement not configured on UAT | — (receiving/count capture contained, J09) | Receive, count, issue and return by scan (C4, after 157 slice 5) |
| Advanced SCM (125) | Supply-chain planning extension | module host | (inside Inventory) | Running on UAT; relay credentials at deploy | — | Planner exceptions on tablet (C4) |
| Procurement (`universal-procurement`) | Requisitions, POs, receipts, vendor bills, 3-way match | module host | PLANNED | Running on UAT; unit scope enforced | — | Approvals in the Actions inbox (C5, needs 163) |
| Orders (`universal-orders`) | Quotes, sales orders, fulfillment, credit memos | module host | PLANNED | Running on UAT; Orders → AR relay waits (no `ar-api` on UAT) | — | Fulfillment tasks and approvals (C5) |
| Accounts receivable (`accounts-receivable`) | Invoices, receipts, credit | `ar-api` (not on UAT) | CONTAINED | Built; not running on UAT | — | Exception review on tablet (C5) |
| General ledger (`financial-operations`), with treasury, costing, budgets, fixed assets, close, consolidation | Books, accounts, postings | module host | PLANNED | Running on UAT; requires AR, Procurement, Orders and Inventory, so it cannot be taken alone | — | Reconciled exception review on tablet (C6) |
| Business partners (`business-partners`) | Customers and vendors (from control-plane parties), credit | module host | PLANNED | Running on UAT; BP → Finance relay not wired | — | Credit decisions on tablet (C5) |
| Manufacturing (`universal-manufacturing`) | BOMs, production orders, MRP | module host | PLANNED | Built (126), running on UAT; S5–S6 differentiators deferred | — | Production step confirmation (C7) |
| Projects (`project-operations`) | Projects, WBS, labor rates, timesheets, billing to AR | module host | PLANNED | Built (129), running on UAT; time path separate from Workforce | — | Own task time on phone through WI-OI-172 (C7) |
| Returns (`universal-returns`) | Return authorisations, credits | module host | PLANNED | Built (128), running on UAT | — | Intake, scan and evidence (C7) |
| Inspection rounds (`operator-rounds`) | Routes, rounds, readings | module host | PLANNED | Built (133), running on UAT | Rounds: assignments, board, sync, evidence | Device proof WI-OI-165 |
| Safety (`safety-operations`) | Hazards, near misses, stop-work, contractor passes | module host | PLANNED | Built (141, 143), running on UAT | Safety reports, contractor pass | Device proof WI-OI-165 |
| Process safety (`process-safety-screening`, SPEED) | Process-safety screening | module host | PLANNED | Stage 1 running; WI-OI-120cg Deploy Group 10 proposed | — | Field evidence (C8) |
| IoT gateway (`iot-gateway`) | Devices, telemetry, alerts | `iot-api` | REVIEW | Built (130); IoT → CMMS relay not wired; certification needs owner UAT run | — | Alert → asset → work (C8) |
| Analytics (`analytics-studio`) | Datasets, charts, reports per module | `analytics-api` | REVIEW | WI-OI-131 In Progress **outside the queue** (uncommitted work in `~/dev/gigalibs`) | — (analytics and reports contained) | Embedded KPIs (C9) |
| Connections (`universal-connector-hub`) | Connectors, inbound data | `connector-hub-api` | REVIEW | Running on UAT | — | — |
| Workflows (`workflow-studio`) | Workflow definitions | no service on UAT | REVIEW | Screens fail on UAT (no service) | — | — |
| Communications (`communications`, TextFly) | Channels, chat | not on UAT | CONTAINED | Email delivery (N1) not wired (no app depends on `notifications-core` or `email-templates`); work-order chat WI-OI-144 Ready | — (TextFly contained, parked) | WI-OI-144 work-order chat (C10) |
| Multi-currency, Tax, Spend (`multi-currency`, `tax-configuration`, `spend-management`) | Rates, tax codes, spend and AP | not on UAT | CONTAINED | Built as code; money-flow cards in plan v3 Phase 5 | — (spend contained) | Expense capture (C6) |
| E-signature, Document scanner, Data contracts, Ontology, Saga, Autonomous recovery, Rule studio | Platform add-ons | not on UAT | CONTAINED | Code exists; plan v3 Phase 6 M-U29 and M-U21 | — (e-sign and documents contained) | E-sign inbox, document capture (C10) |

### 3.3 What crosses module boundaries today

| Flow | State |
| --- | --- |
| CMMS → Workforce staffing, Workforce → CMMS bookings | Wired; bookings shown on the work order, not made its assignee (§2 #17) |
| Rounds → CMMS, Workforce, Analytics | Wired |
| Control plane parties → Business partners | Wired |
| Orders → AR, Projects → AR, Projects → Finance | Declared and wired in Compose; AR is not running on UAT, so AR events wait |
| Inventory ↔ Finance, Inventory → Procurement, BP → Finance, IoT → CMMS, entitlements → Analytics | **Not wired** (owner keys needed; waiting events reviewed first) |
| Master facts (`MASTER_FACT_V1`) | Products, units, categories, warehouses, accounts write them (`bd852946`); consumers come with WI-OI-156 B |
| Project time ↔ Workforce time | **Not connected** (two time systems) |

## 4. Workforce across sectors: how to configure today, and the gap

The model separates **who manages** (organization units: create one only where there is management, cost or an access
boundary), **where work happens** (Places: store, plant, line, field, venue, building, depot), **who can work**
(Workforce person, team or pool with skills, positions, engagements of type employee, contractor, agency or volunteer)
and **what may be seen** (the person's own units and places, plus roles). A single plant needs no units.

| Sector | Configure today | First gap (card) |
| --- | --- | --- |
| Retail chain | Districts as units only if they manage; outlets as Places; staff on positions at the outlet | Repeating shifts (171); supervisor scope (167) |
| Manufacturing (many plants) | Plant or department units; Place tree plant → area → line; CMMS assets on Places | Booking → work-order assignee (169); scope (167) |
| One plant | Flat workspace; one plant Place | Works today |
| Events and sports | Venues as Places (coordinates, time zone); event as a project with a customer; crew requirements | Event demand source (171); one time path to billing (172); rented equipment (175) |
| Security agency | Client buildings and posts as Places; licences as qualifications; geofenced punches | Post rosters (171); billing per post (172) |
| Workforce supplier | One supplier workspace; clients as Business partners; client sites as Places | Client and bill rate on demand (172); candidate search beyond 200 (167); sharing workers across workspaces is a later design |
| Agriculture | Farm units; fields as Places with boundaries; seasonal contractors | Field-task source (171); piece rate (173) |
| Supply chain | Warehouse units; warehouses and docks as Places | Inventory tasks as demand (171) |
| Logistics | Depots as Places; drivers booked by shift | No route or trip records exist (plan v3 §7 D) |
| Fleet | Vehicles as CMMS assets; equipment check on mobile; licence as qualification | Driver and vehicle checks at booking; ownership (175) |
| US travel crews | — | Pay by the worksite's state, allowances (173) |

**HRMS:** not built and not needed for operations. Workforce holds the operational half (organization, positions,
engagements, qualifications, absences, calendars, time, pay-ready runs, `PAYROLL_CSV_V1` export). Employment
administration (offers, contracts, leave balances, compensation, benefits, statutory payroll) stays with the customer's
HRMS or payroll, connected through Connector Hub (plan v3 §7 D "HR beyond Workforce").

## 5. Mobile scope (every module)

**Rules (both repositories):** the phone and tablet use the same login, permissions, scopes and records as the web;
every mobile command goes through `/mobile/v1` to the module's API, which re-checks everything; the app has no queue of
its own (its work belongs to the platform card that names it); app code lives only in `~/dev/gigalibs_mobile`.

| When | Mobile scope | Card |
| --- | --- | --- |
| Now (compiled, 42 routes) | Sign-in, workspace switch, profile; inspection rounds; calibration; commissioning; visual spares; shift logbook; work instructions; equipment check; report a problem; safety; contractor pass; permits and LOTO | Built 133–143; proven on a device in WI-OI-165 |
| Queue | CMMS work: Today → my work orders, execute and complete, supervisor sign-off | WI-OI-164 (needs 163 offers, 169 assignee) |
| Queue | Frontline journeys proven on a signed device against UAT | WI-OI-165 |
| After milestone B | Workforce: my shifts, accept or decline, clock in and out with place check, breaks, my timesheet and submit, request absence; supervisor tablet: today's coverage, fill a requirement from candidates, approve time and absences | WI-OI-170 |
| Stage C | Inventory scan flows; approvals inbox (Procurement, Orders, Finance, Business partners) using record offers; manufacturing step confirmation; returns intake; project task time; SPEED field evidence; IoT alert → work; maps; embedded KPIs; work-order chat; e-sign inbox; document capture | Each module's completion card (§7) |
| Later | Offline and sync beyond rounds (plan v3 X7); Assistant on mobile (on hold) | Plan v3 Phase 6 step 7; WI-OI-120bc |

## 6. New cards (owner, 2026-11-03)

| Card | What | Mobile part | Size |
| --- | --- | --- | --- |
| [WI-OI-167](../../.pi/tasks/WI-OI-167.md) | Workforce scope completion (security): finishes WI-OI-120ho, adds the candidate list and booking checks, unit on requirements, Workforce on the scope allow-list | `/mobile/v1` inherits it | M |
| [WI-OI-168](../../.pi/tasks/WI-OI-168.md) | Status truth on UAT: read-only check of every module already running there; relabel rows by evidence | Device-free | M |
| [WI-OI-169](../../.pi/tasks/WI-OI-169.md) | Booking → work-order assignee (Workforce ↔ CMMS) | Lets 164 show booked work | S |
| [WI-OI-170](../../.pi/tasks/WI-OI-170.md) | Mobile Workforce: my shifts, clock in/out, my time, absence; supervisor tablet | The card is mostly mobile | L |
| [WI-OI-171](../../.pi/tasks/WI-OI-171.md) | Rosters: shift templates, repeating shifts, demand sources beyond manual, CMMS and project | Shifts appear in 170 | L |
| [WI-OI-172](../../.pi/tasks/WI-OI-172.md) | Customer and rate on demand; one time path from Workforce to Projects billing | — | L |
| [WI-OI-173](../../.pi/tasks/WI-OI-173.md) | Pay by worksite: jurisdiction from the Place, pack by site, allowances | — | L |
| [WI-OI-174](../../.pi/tasks/WI-OI-174.md) | Reporting lines and approval routing | Approvals land on the right tablet | M |
| [WI-OI-175](../../.pi/tasks/WI-OI-175.md) | Asset ownership and hire; driver and vehicle checks for fleet | Equipment check shows ownership | M |

## 7. Completion order

The queue (§6a of the master data plan) holds items 0–26. After it, each module is completed by **one card per
module**, in the order below, written at claim time from the template in §8 with the next free `WI-OI` number and shown
to the owner before work starts (plan v3 §6). Each completion card carries the module's open items listed here, its
mobile scope (§5) and the full Done checklist (plan v3 §2), including the owner's acceptance on UAT.

| Stage | Module completion | Open items known today (verify at claim) |
| --- | --- | --- |
| C1 | CMMS complete (M-CM1 acceptance, M-CM2) | Journey re-run and five owner ticks (`PHASE-1-CM1-CHECKLIST.md`); reliability analytics from persisted facts (CM-07); kiosk on a tablet (CM-04); EAM-001–005 rest; request → several work orders is WI-OI-166 |
| C2 | Workforce complete (M-WF2, M-WF3) | Time approval on metadata; one worker record (T1b, `wfo_*` empty); CMMS workers as a Workforce projection (T1c, with WI-OI-157 people); departments → units (T2: positions still carry the legacy `departmentId`); segregation of duties (R3); delegation and revocation (R4); compliance |
| C3 | Places complete (M-GEO) | CMMS spaces onto Places (T3); R5 Geospatial; maps on mobile |
| C4 | Inventory, with Material ledger, Landed cost and Advanced SCM | Inventory ↔ Finance and → Procurement relays configured on UAT (owner keys); unit and place scope (R5 Inventory, then the allow-list); stock owner after WI-OI-157 slice 5; mobile scan flows |
| C5 | Procurement, Orders, Business partners, AR | `ar-api` started on UAT with its relays (Orders → AR, Projects → AR); BP → Finance relay; M-SPEND link and 3-way match; FR-17 event billing; approvals inbox on mobile |
| C6 | General ledger and money foundations (M-CUR, M-TAX, M-SPEND, M-TRE, M-COST, M-BUD, M-FA, M-CLOSE, M-CONS) | GL usable alone (review `requiredModules`); Finance ↔ Inventory relay; Accounting reviewer on every posting card |
| C7 | Manufacturing, Projects, Returns | Read-only check (WI-OI-168) then journeys; Manufacturing S5–S6 differentiators; Projects joins the time path (WI-OI-172) |
| C8 | Safety, Process safety (SPEED), IoT | WI-OI-120cg Deploy Group 10; IoT → CMMS relay; IoT certification run (`.pi/handoff/WI-OI-130-UAT-JOURNEY.md`) |
| C9 | Analytics | WI-OI-131 brought into the queue (owner decides; see the hand-over); entitlements → Analytics relay |
| C10 | Connections, Rule studio, Communications (N1 email, WI-OI-144 work-order chat), Workflow Studio, then the contained add-ons one at a time (Data contracts, E-signature, Document scanner, Ontology, Saga, Autonomous recovery) | Workflow Studio: the owner decides start its service or hide its screens |
| C11 | Assistant (Giga Companion) | Resumes after C1–C10 (owner 2026-10-27) |

Plan v3's platform tracks not tied to one module (Phase 3 enterprise onboarding WI-OI-120p; Phase 4 engine apply;
O1–O7 operations; T8a/T8b; R11; R17; T9a) keep their v3 order and are checked against evidence when reached; their v3
status column is dated 2026-10-15.

## 8. Template for a module completion card

```
# WI-OI-NNN: <Module> complete — web and mobile

- Status: Proposed (written at claim from docs/plans/all-modules-completion-plan.md §7 stage Cn); shown to the owner.
- Size: from the open items.
## Goal
<Module> passes the Done checklist (plan v3 §2) on UAT, with its mobile scope, and the owner accepts it.
## Open items (from the register, re-checked at claim)
- … (each with its evidence path)
## Mobile scope
- Routes added to /mobile/v1 (apps/workflow-platform/lib/mobile-bff.ts) and the control-plane mobile authority.
- Feature compiled in gigalibs_mobile apps/operations/src/navigation/compiled-features.ts; same permissions.
## Done when
- [ ] Every open item closed with tests; `pnpm verify` green; compiled modules load under Node; `next build` for web.
- [ ] Permission tests through the real session path (allowed, denied, other unit, other site); two-workspace test.
- [ ] Relays the module produces are configured on UAT and healthy, or recorded "no consumer yet".
- [ ] Journey steps pass on UAT (read-only by agents; the owner deploys); device proof for the mobile part.
- [ ] Owner's acceptance recorded; evidence in .pi/work/WI-OI-NNN.md; NOW.md and WORK_ITEMS.md updated.
```

## 9. Superseded documents

For module status these are history: plan v3 §3 and §7 (2026-10-13), `value-first-all-module-release-program.md`
(2026-09-28), `tenant-to-value-all-modules-implementation-and-e2e-plan.md` (2026-10-06), the status lines of
`.pi/handoff/CURSOR-HANDOFF-MODULES-5-7-2026-10-29.md` and `.pi/handoff/FRONTLINE-SUITE-100-DEPLOY-2026-11-02.md`.
Their card definitions and technical detail still apply.
