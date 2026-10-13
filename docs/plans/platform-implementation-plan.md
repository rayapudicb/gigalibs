# GigaLibs platform implementation plan (version 2)

Date: 2026-10-06. Programme: WI-OI-120. Status: **Proposed for correction and decomposition** (owner: "a 100 %
implementation plan, better than iDempiere, with a better user experience", covering screens and metadata, access
control, and tenancy and master data). Version 2 answers the read-only review of version 1 (GPT, 2026-10-06, against
GigaLibs `7485aec` and iDempiere `9a80664`); §9 traces every finding. Analysis and parity matrix:
`platform-parity-and-beyond-plan.md`.

**Order superseded (owner, 2026-10-13):** `gigalibs-execution-plan-v3.md` sets the order and status of every card; the
card definitions in §3 remain the reference.

This plan grants no implementation, deployment or data authority. Each card is written, shown and approved before
work starts. Production stays NO-GO until G5, G6 and G7 (§6).

## 1. Ground rules

- **One card, one independently testable outcome**, with one owner. Its WI number is assigned when it is written.
  Sizes here are relative (S, M, L) and are re-estimated when the card is written, after its migration design and
  threat model.
- **Gates.** `pnpm build`, `pnpm test`, `pnpm verify` and the card's proof (HTTP on an isolated database, or a
  migration rehearsal) pass; the WI-OI-120m journey gains the card's steps; evidence goes to `.pi/work/WI-OI-120.md`.
- **Security gate, unchanged from the cards:** a card that changes access, money, migration or tenancy has an
  independent Security review **before it is deployed**, recorded with the reviewer's name. For UAT only, the owner
  may name an interim reviewer (2026-10-06: GPT for WI-OI-120n); production always needs the named D7 reviewer.
  Posting rules also need the Accounting reviewer.
- **Evidence for every status.** *Built* = code exists; *Verified* = proof and journey pass on the candidate image;
  *Accepted* = G5. A claim of "ahead of iDempiere" needs Verified plus the comparative task evidence of X2.
- **No parallel engines.** Extensions complete ADR-0019 and ADR-0033 (dictionary, renderer, document lifecycle,
  posting) and ADR-0018 (scope); nothing is rebuilt beside them.
- **Metadata first (owner, 2026-10-05 and 2026-10-06: every module on the metadata foundation).** Every business
  screen, module and platform alike, is a published metadata window: its fields, field rules, menus, actions,
  reports, processes, translations and printable documents come from the dictionary and can be adjusted per
  workspace. No new or changed business screen is hand-written; a hand-written screen receives only fixes, each
  linked to its conversion card. **Named exceptions** (ADR-0033 D1): specialised interactions that are components
  *inside* a metadata-governed screen, whose fields, permissions and actions still come from metadata (maps and CAD
  layers, the CMMS floor kiosk, dispatch and scheduling boards, the clock-in panel, barcode scanning, chart and
  dashboard builders, the workflow designer canvas); Configuration Studio's own designers (they edit the metadata);
  sign-in, sign-up, the workspace chooser and the application frame (they run before or around every screen).
  Anything else hand-written is a defect.

## 2. Stage 0: decisions and registers (before any dependent card)

| # | Decision or register | What it settles | Blocks |
| --- | --- | --- | --- |
| D1 | **Effective-access model** (ADR, amends ADR-0018) | Role assignments are **scope-bound** (a role is held *at* units or places, as iDempiere's role-org access), never a union of all roles with all scopes ("approver in North, reader in South" stays exactly that). Composition per assignment; acyclic inheritance; segregation-of-duties conflicts; delegation (time-boxed, never more than the delegator holds); immediate revocation (session version bump). Threat model. | R1–R4, R13–R16 |
| D2 | **Platform support access** (ADR-0018 amendment) | ADR-0018 keeps tenant-wide authority for platform roles. Replacing it with consented, time-boxed, audited support sessions is an amendment for the owner, with compatibility and revocation. | R11 |
| D3 | **Approval-policy model** | Immutable minimums no workspace can weaken (for example maker ≠ checker on financial documents); configurable bounds (approver role, amount limits in a stated currency at the document date, accumulated limits, split-document detection, number of approvers); policies published through Configuration Studio governance and **pinned per document** so in-flight approvals keep their policy version. | R6, R7, X4 |
| D4 | **Canonical owners** | Worker: Workforce resources (ADR-0003 D7). Department: organization units (ADR-0018). Place: Geospatial owns the identity of sites, buildings, floors and zones (ADR-0006); CMMS owns facility details keyed by place (areas, use, CAD/BIM). Party: Parties, with snapshots on documents (a posted invoice keeps the name and address it was issued with). Stock: Inventory commands. Invoices: AR for customers, Procurement for vendors, Spend → AP. Assets: CMMS operational asset linked to the Finance fixed asset. | T1–T7, E2 |
| D5 | **ADR status** | ADR-0003 and ADR-0006 are *Proposed*; the owner accepts or revises them before cards rely on them. | T1, T3 |
| D6 | **Registers v1 (frozen denominators)** | Action register (every module action); parity register (every iDempiere platform mechanism and functional-map row → card or signed exclusion, with evidence status); **access-path matrix** per module: list, read, create, update, action, lookup, report, export, job and cache × tenant, unit, place, object and field, with each entity's unit / shared / either policy. | R5, §7 |
| D7 | **First-value scenarios and the UX task set** | M1a, M1b and M1c scope (§5); twelve benchmark tasks with representative users, data, devices, network and load, measured on GigaLibs and on a local iDempiere with comparable data. | M1, X2 |
| D8 | **People** | D7 named reviewers (Security, Accounting, QA, release authority); D8 Legal on the iDempiere reference. | Production |
| D9 | **Migration design template** | For every master move: mapping, duplicate resolution, historical snapshots, backfill, reconciliation report, compatibility reads, single-write cutover, recovery criteria and a rehearsal on a UAT copy. | T1–T5 |

## 3. Cards by area

### Area 1. Screens and metadata (S)

| # | Card | What is built | Needs | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| S1 | Field rules | Display, read-only, mandatory and default rules executed in the renderer and re-validated on the server; unsupported rules refused at publish | — | M | Publish refuses an unsupported rule; the server refuses what the screen would have prevented |
| S2 | Window accessibility | Keyboard-operable grids and rows, focus order, labels, screen-reader names | — | M | Manual keyboard and screen-reader pass on every window type; zero serious axe findings |
| S3 | Money fields | Currency-scaled amounts with rounding by currency; minor units only inside adapters | — | M | Large values, rounding, three-decimal currencies and locales pass; people type 12.50 |
| S4 | Quantity and unit fields | Exact decimals with a unit; conversion precision per unit (never minor units) | — | M | Fractional and converted quantities round-trip exactly |
| S5 | Workspace customization end to end (U5) | Custom fields stored and validated by the owning module; publish → authorized save → reload; upgrade of a module baseline over a workspace overlay with conflict detection; activation rollback and recovery | — | L | A custom field survives publish, reload, a baseline upgrade and a rollback without touching existing records |
| S6 | Dictionary menus | Menus from module contributions and workspace overlays (ADR-0019 mapping), filtered by permission | R1 | M | A workspace renames, orders or hides a menu entry through Studio |
| S7 | Processes | Dictionary processes: parameters, registered handler, run as a kernel job with progress, retry and audit | S1 | L | A long process shows progress, can be retried, and records who ran it |
| S8 | Reports and info windows | Governed reports and multi-record lookups over the record dispatcher, honoring scope and export rights | S1, R10 | L | A report shows only rows the person may read; export follows R10 |
| S9 | Record history | A per-record timeline from audit: who, what, when, why; filtered by access | S1 | M | Every saved change shows on the record; a person without access sees nothing |
| S10 | Attachments and notes | File and note storage per record with permissions, size limits, scanning and retention | T9 | M | An attachment follows the record's access and its retention class |
| S11 | Translations | Labels and messages per language, with workspace overlays per language | S1 | M | A window switches language with no code change |
| S12 | Document templates | Printable and PDF documents per document type with workspace branding | S7 | M | An invoice, a work order and a journal print from templates |
| S13 | Numbering | Workspace sequences per document type (prefix, period, gap policy) through the document engine | E1 | S | Journals and work orders take numbers from the workspace sequence |
| S14 | Import and export | One import for every entity through the dispatcher: map, preview, hold back bad rows, commit idempotently; export under R10 | S1, R10 | L | Products, accounts, assets and people import the same way |
| S15 | Gateway from declared routes | Gateway routes generated only from routes a module explicitly exports with their permission and entitlement; internal routes never exposed | R1 | M | Tests prove no internal route is exposed, every exported route enforces entitlement and method permission, and the generated set equals today's approved list |
| S16 | Conversion kit | The template every module conversion follows: contribution, adapters, register rows, journey section; lifecycle graphs and posting policies are added to it when E1 and E2 land | S1 | S | CMMS and Workforce convert with it |
| S17 | Platform screens on metadata | Settings (team, organization, access, plan), Parties and administration as metadata windows over control-plane record adapters | S16 | L | No hand-written platform screen remains outside the named exceptions |

### Area 2. Access control (R)

| # | Card | What is built | Needs | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| R0 | WI-OI-120n batch 1 | Module roles, Login picker, plan gate, Currency switch, invitation entry, words not codes (built `7485aec`) | Security review | — | Reviewed; journey rerun passes on UAT |
| R1 | Permission vocabulary | One code format; one matcher in the module SDK used by every module and the web; a permission catalogue generated from `module.yaml` | D1 | M | Every module guard passes on the shared matcher; the role editor lists real permissions only |
| R2 | Scope-bound role assignments | A person holds several role assignments, each at its units or places; acyclic inheritance; existing single custom roles migrated | D1, R1 | L | "Approver in North, reader in South" is enforced exactly; removing one assignment removes only its access |
| R3 | Segregation of duties | Conflicting permission pairs per document type, checked at assignment and at each transition | R2 | M | A conflicting assignment is refused or flagged; a transition refuses the conflicting actor |
| R4 | Delegation and revocation | Time-boxed delegation within the delegator's assignment; revocation applies on the next request | R2 | M | Revoked access fails at once; delegation ends at its time |
| R5 | Access paths, per module | Each module enforces its row of the access-path matrix (list, read, write, action, lookup, report, export, job, cache) with its unit / shared / either policy | D6, R1, R2 | L each | Per module: two tenants, cross-unit, read-only, stale tree version and shared-record tests pass |
| R6 | Approval policies | D3 implemented through Configuration Studio governance, read by document-engine guards, pinned per document | D3, E1, R2 | L | Over-limit needs the higher role; the immutable minimums cannot be weakened; in-flight documents keep their policy |
| R7 | Document-action access | Which roles may perform which action on which document type, configurable per workspace within D3's minimums | E1, R2 | M | A role without "reverse" on journals is refused on screen and by the API |
| R8 | Record sharing | Records shared with named people or units (ADR-0003 D9), without revealing records a person cannot see | R5 | L | A shared record is visible to its recipients only; others get the same "not found" as for a missing record |
| R9 | Column rules | Read, write and exclude rules per role on fields, applied in the dispatcher, reports and exports | R1 | M | An excluded field is absent from screens, exports and reports |
| R10 | Export, report and query rights | Permissions for export and reports; row limits per role | R1 | S | A role without export cannot export by any path |
| R11 | Platform support access | D2 implemented: consented, time-boxed, audited support sessions | D2, R1 | M | Without a session a platform operator sees no workspace data; with one, every read is audited and ends on time |
| R12 | Explainable access | A refusal names the missing permission, role or scope and who can grant it, only within what the person may already see | R1, R5 | M | Explanations never reveal a record or unit the person cannot see |
| R13 | Delegated people administration | Department allowances; heads add people only into their units with allowed roles (WI-OI-120p slices 3–4) | R2, T2, S17 | M | A head cannot assign outside their units or above the allowance |
| R14 | Bulk people | CSV or pasted list checked before anything is created; invitations together; links until email exists; join tracker; bulk grants; offboarding (120p slices 5–7) | R13 | L | 200 people added and granted in one import; bad rows held back; offboarding revokes at once |
| R15 | Directory groups | SCIM groups map to scoped role assignments (120p slice 8) | R2, R14 | M | A directory change moves a person's assignments |
| R16 | Personas from roles | Default landing and menu lens derived from assignments; "View As" for administrators only | R2 | S | A technician lands on their work without choosing a persona |

### Area 3. Tenancy and master data (T)

Every T card follows the D9 migration template and is rehearsed on a UAT copy before it runs.

| # | Card | What is built | Needs | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| T1a | Automatic worker link (WI-OI-120o) | Accepting an invitation links the Workforce person with that email (accept emits an event; Workforce consumes) | D4 | M | An invited technician punches time with no manual link |
| T1b | One worker record | WFO workers (`wfo_workers`) migrated onto Workforce resources with U20a | D4, D9, M-WF1 | L | One person per worker; reconciliation report shows every WFO worker mapped |
| T1c | CMMS workers as a projection | CMMS's worker copy fed by Workforce events (ADR-0007); its direct import retired | D4, D9 | M | A new worker appears in CMMS once, from Workforce |
| T2 | Departments as units | Legacy departments and CMMS departments mapped to units; members and assets refer to units; historical documents keep their department snapshot | D4, D9 | L | No department list outside Organization; reconciliation shows every reference mapped |
| T3 | One place identity | Geospatial owns sites, buildings, floors and zones; CMMS facility details keyed by place id; CMMS spaces migrated | D4, D5, D9 | L | A site made in `/maps` is the one CMMS, clock-in and place scope use |
| T4 | Parties everywhere | Orders, Procurement, CMMS vendors and Finance refer to parties; documents keep snapshots; duplicate find and merge | D4, D9 | L | No free-text customer or vendor; a merge keeps history intact |
| T5 | One stock authority | Inventory issue, return and reserve commands first; CMMS parts use them; balances migrated; dual-run reconciliation, then single-write cutover | D4, D9, M-INV1 | L | Issuing a part moves Inventory stock once; dual-run shows zero differences before cutover |
| T6 | Asset link | CMMS operational assets linked to Finance fixed assets, one master each | D4 | M | Disposal in Finance shows on the CMMS asset |
| T7 | Invoice owners | AR for customer invoices, Procurement for vendor invoices, Spend into AP, as D4 decides | D4 | M | Each invoice type has one owner; no duplicate invoice path |
| T8 | Tenant lifecycle | Plans and entitlements, trial to paid, suspension and reactivation, quotas, metering and billing hand-off | — | L | A suspended workspace is read-only and recovers on reactivation; usage is metered |
| T9 | Privacy and retention | Data classes, retention periods, legal hold, workspace export and deletion | — | L | A workspace export is complete; deletion removes data after its hold, with proof |
| T10 | Legacy-data onboarding | Import templates for parties, products, assets, people and opening balances | S14 | M | A customer's spreadsheet loads with a reconciliation report |
| T11 | Set-up wizard | Guided first run: company, units, sites, people, roles, modules from the plan, module set-ups, solution pack | R14, T2, T3 | L | A new customer reaches the M1a outcome without help |
| T12 | Legal entities | Several companies inside one workspace, ready for consolidation | D4 | M | Two legal entities keep separate books inside one workspace |

### Engine and posting (E)

| # | Card | What is built | Needs | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| E1 | Document lifecycle (ADR-0033 F1) | `@gigalibs/document-lifecycle` on bounded documents first (Finance journal drafts, Catalogue versions), keeping their behaviour | — | L | Both move over unchanged; a locked period refuses every financial transition |
| E2 | Posting prerequisites | Accounting schema and posting-rule model; each document type declares posts, commitment only or none; source identity includes the document version (forward migration of Finance's unique index) | E1, D4 | M | A second version posts once; a "none" document never posts |
| E3 | First posting chain | Inventory goods receipt → Finance journal through relay and inbox, with reversal, late events, closed periods, poison messages and a deliberate reconciliation difference | E2, M-INV1 | L | Every failure case is visible, retried after correction and reported |
| E4 | Relays and consumers per flow (U22) | Delivered with each flow (procure-to-pay, quote-to-cash, maintenance to cost) | E3 | L per flow | Stopping and restoring a consumer delivers each effect once |
| E5 | Reconciliation and close guard | Daily documents-to-journals reconciliation; close blocked while the period has undelivered events; delivered with each flow | E3 | M | A deliberate difference is reported; close refuses until resolved |
| E6 | Budget control | Commitments from requisitions and orders, delivered with Procurement | E1, M-PROC | M | Over-budget requisitions follow the approval policy |

### Modules on the engine (M)

Each is a module card built with S16: dictionary contribution, adapters, lifecycle graph (E1), posting policy (E2),
its access-path row (R5), register rows and journey section. A module without a running backend gets a runtime slice
first (deploy on the module SDK), then its conversion.

| # | Card | Needs | Size |
| --- | --- | --- | --- |
| M-CM1 | CMMS onto metadata windows and first value: assets, spaces, work orders (request, assign, execute, close; "do my own work" separated from "manage any work order"), schedules, meters, parts, requests; kiosk, maps and CAD stay components | R5 (CMMS), T3, S16 | L |
| M-WF1 | Workforce onto metadata windows with U20a: people (login link administrator-only), skills, jobs and positions, availability, absences, bookings; WFO routes, permissions and ownership; clock-in and dispatch stay components | R1, S16 | L |
| M-WF2 | Workforce time and timesheet approval for linked workers | T1a, M-WF1 | M |
| M-INV1 | Inventory: transfers, issues, counts, adjustments, reservations; barcode in the window | E1, S3, S4 | L |
| M-FIN1 | Finance GL completion: chart import, recurring journals, posting rules (Accounting review) | E2 | M |
| M-PROC | Procurement: requisition, approval, order, receipt, vendor invoice, three-way match | T4, T5, E1, R6 | L |
| M-ORD | Orders: quotation, order, reservation, dispatch, shortage, credit | T4, E1 | L |
| M-AR0 | AR runtime on the module SDK | R1 | M |
| M-AR | AR: invoice, delivery, allocation, aging, FR-17 billing | M-AR0, M-ORD, T7 | L |
| M-TRE | Treasury: statement import, matching, reconciliation | E2 | L |
| M-COST | Costing: cost layers, landed cost, cost of goods sold | M-INV1, E3 | L |
| M-BUD | Budgeting | E6 | L |
| M-FA | Fixed assets | T6, E2 | L |
| M-CLOSE | Period close, accruals, year end | E5 | M |
| M-CONS | Consolidation | M-CLOSE, T12 | L |
| M-CM2 | CMMS complete: reliability (U19b), kiosk (U19c), EAM-001–005 | M-CM1, T5 | L |
| M-WF3 | Workforce complete: scheduling, pay readiness, compliance | M-WF2 | L |
| M-U21 | Communications, Connectors, Rule Studio | S7 | L |
| M-ANA | Analytics onto metadata windows (sources, datasets, measures, reports; builders stay components) and its acceptance: freshness, scope | R5 (Analytics) | M |
| M-GEO | Geospatial onto metadata windows (places, node types, boundaries; the map stays a component) and its acceptance: scoped queries | T3 | M |
| M-U29 | One card per remaining module (Tax, Currency, Spend, eSign, Scanner, Ontology, Saga, Recovery, Workflow Studio, Data Studio and others): runtime slice, then conversion | R1, E1 | M–L each |
| M-NEW | Manufacturing (U24), projects (U25), returns (U26) | E1, M-INV1, M-ORD | L each |

### Operations and release (O), started at Stage 0

| # | Card | What is built | Needs |
| --- | --- | --- | --- |
| O1 | Environments and cloud | Target cloud design, infrastructure as code, environments, network, secrets management | D8 |
| O2 | Migration and recovery | Rollback per module migration; backup and restore drills; RPO and RTO agreed and rehearsed | O1 |
| O3 | Observability | Logs, metrics, traces, alerts and SLOs per journey | O1 |
| O4 | Performance and load | Workload model and targets per journey; load tests on candidate images | O3 |
| O5 | Security operations | Dependency and secret scanning, penetration test, incident response | O1 |
| O6 | Support and runbooks | Runbooks per service; support access through R11 | R11 |
| O7 | Documentation and training | Administrator guide, user guides per module, in-app help | — |

### Experience (X)

| # | Card | What is built | Needs |
| --- | --- | --- | --- |
| X1 | UX standard v2 | No internal codes or raw ids (business numbers such as a work-order number are fine); consistent patterns, not identical screens (maps, dispatch and field work keep their components); plain-language errors with a next step | — |
| X2 | Task benchmark against iDempiere | D7's twelve tasks measured for time, errors, help needed and recovery, at Stage 0 and at every milestone, on both systems | D7 |
| X3 | Manual accessibility audit | Keyboard and screen-reader audit per release | S2 |
| X4 | My work inbox | Approvals, assignments, timesheets and exceptions in one place; due dates, delegation, out-of-office | E1, R6, R4 |
| X5 | Search everywhere | A command palette over records and actions the person may use | R1, R5 |
| X6 | Embedded analytics | Live KPIs beside each window's records | M-ANA |
| X7 | Mobile and offline (U27) | Technicians execute work, punch time and capture evidence offline | M-CM1, M-WF2 |

## 4. Order of work (dependency-checked)

One writer; one card at a time; read-only discovery (registers, migration designs, threat models) may run beside it.

1. **Stage 0 → M0.** D1, D2, D3, D4, D5, D6, D7, D8, D9 decided or delivered; O1 design and O7 started; X2 baseline.
2. **M1a minimum maintenance.** R0 (after its review) → R1 → S1 → S16 → R2 → R5 (CMMS) → T3 → M-CM1.
3. **M1b Workforce and departments.** M-WF1 → T1a → M-WF2 → T1b → T1c → T2 → R5 (Workforce, Geospatial) → R3 → R4.
4. **M1c enterprise onboarding.** S17 → R13 → R14 → R15 → R16 → R11 → T11.
5. **M2 engine and customization.** E1 → S2 → S3 → S4 → S5 → S6 → S15 → R10 → R6 → R7.
6. **M3 first posting.** E2 → M-INV1 → E3 → E5 (pilot) → M-FIN1.
7. **M4 procure to pay.** T4 → T5 → R5 (Inventory, Procurement, Finance) → M-PROC → E6 → E4 (procure to pay).
8. **M5 quote to cash.** T7 → M-ORD → M-AR0 → M-AR → M-TRE → R5 (Orders, AR) → E4 (quote to cash).
9. **M6 record to report.** M-COST → M-BUD → T6 → M-FA → M-CLOSE → T12 → M-CONS.
10. **M7 full platform.** M-CM2 → M-WF3 → S7 → M-U21 → M-U29 cards → R5 (Analytics) → M-ANA → M-GEO → S8 → S9 → T9 →
    S10 → S11 → S12 → S13 → S14 → T10 → R8 → R9 → R12 → T8 → X3 → X4 → X5 → X6 → X7 → M-NEW.
11. **Release.** G5 acceptance → G6 authorized rollout → G7 observed production. O2–O6 are required at each milestone
    exit for the flows that milestone releases, not left to the end.

Every card's "Needs" appears earlier in this order, checked mechanically against the tables above (violations found
and fixed: S7 now precedes M-U21; on 2026-10-06 the conversion kit S16 and field rules S1 moved before CMMS, whose
card had omitted them).

## 4a. Phases at a glance (what each release delivers)

| Phase | Goes in | The release delivers | Modules on metadata |
| --- | --- | --- | --- |
| 0 Decisions | D1–D9 (D1, D4 for places and D5 for ADR-0006 decided 2026-10-06); registers; migration template; cloud design; iDempiere baseline | No release | 3 (Catalogue, Inventory, Finance GL) |
| 1a Minimum maintenance | Batch 1 (R0); one permission checker (R1); field rules and conversion kit (S1, S16); roles per unit or site (R2); CMMS access (R5); one place list (T3); **CMMS onto metadata** (M-CM1) | A CMMS-only customer runs maintenance on metadata screens, each person with a scoped role | 4 |
| 1b Workforce and departments | **Workforce onto metadata with U20a** (M-WF1, M-WF2); worker links and one worker record (T1a–T1c); departments as units (T2); access (R5, R3, R4) | Technicians clock in; supervisors approve weeks; departments kept apart | 5 |
| 1c Enterprise onboarding | **Platform screens onto metadata** (S17); delegated heads, bulk people, directory groups, personas, support access (R13–R16, R11); set-up wizard (T11) | A company onboards 200 people by department through guided set-up | 5 plus platform screens |
| 2 Engine | Document lifecycle (E1); accessibility, money and quantity, workspace customization, menus, safe gateway (S2–S6, S15); export rights, approval policies, action access (R10, R6, R7) | Approvals by policy; customization with preview and rollback | 5 |
| 3 First posting | Posting rules, goods receipt to ledger, reconciliation (E2, E3, E5); Inventory and Finance GL completed | Stock receipts reach the ledger once, failures visible | 5 |
| 4 Procure to pay | Parties everywhere, one stock authority (T4, T5); **Procurement onto metadata**; budget control and relays (E6, E4) | Request, order, receive, invoice, match, post | 6 |
| 5 Quote to cash | Invoice owners (T7); **Orders and AR onto metadata**; Treasury | Quote, order, ship, invoice, collect, post | 8 |
| 6 Record to report | Costing, budgets, fixed assets, close, consolidation; asset link and legal entities (T6, T12) | Monthly close and consolidated statements | 8 |
| 7 Full platform | CMMS and Workforce completed; **the remaining 15 modules onto metadata** (Communications, Connector Hub, Rule Studio, Tax, Multi-Currency, Spend, eSignature, Document Scanner, Ontology, Saga, Recovery Studio, Workflow Studio, Data Studio, Analytics, Geospatial); processes, reports, history, attachments, translations, documents, numbering, import and export (S7–S14); record and field rules, explainable access; lifecycle, privacy, legacy import; inbox, search, embedded analytics, offline mobile; manufacturing, projects, returns | The full platform | 23, plus 3 new |
| Release | G5 acceptance → G6 authorized rollout → G7 observed production | Production | — |

Operations (O2–O7) and the experience rules and benchmark (X1, X2) apply in every phase to what it releases.

## 5. Milestones

| Milestone | Reached when |
| --- | --- |
| M0 Decisions | D1–D9 recorded; registers v1 frozen; X2 baseline measured |
| M1a Minimum maintenance | A CMMS-only workspace (administrator, supervisor, technician) raises, assigns, executes and closes work orders at its sites, each person with a scoped module role |
| M1b Workforce and departments | Linked technicians punch time and a supervisor approves the week; two departments cannot see each other's work |
| M1c Enterprise onboarding | A head adds 200 people in one import within allowances; directory groups and the set-up wizard work |
| M2 Engine | Field rules, money and quantity fields, workspace customization, menus, approval policies and action access are published, not rejected |
| M3 First posting | A goods receipt reaches the ledger once, with every failure case visible and reconciled |
| M4 Procure to pay | Request, approve, order, receive, invoice, match and post |
| M5 Quote to cash | Quote, reserve, dispatch, invoice, collect and post |
| M6 Record to report | Costing, budgets, assets, close and consolidation produce statements the Accounting reviewer accepts |
| M7 Full platform | Every registered module and capability passes its register rows |
| G5, G6, G7 | Acceptance; authorized rollout; observed production (three separate gates) |

## 6. Definition of done for the programme

- **Frozen denominators:** the action register, the parity register and the X2 task set, each versioned; changes
  only by owner decision, with exclusions signed.
- **Status needs evidence:** Built, Verified and Accepted are separate; "ahead" needs Verified plus X2 evidence.
- **Defects:** no open Critical or High finding; Medium and Low triaged and accepted by the owner.
- **Experience:** the X2 tasks are at least as fast and less error-prone than on iDempiere, with zero serious
  accessibility findings and a manual audit pass.

## 7. Better than iDempiere: what must be proven

iDempiere already has per-client, role and user window customization (`MUserDefWin`), included roles, record, column
and table access, document-action access and approval limits (`MRole`, `X_AD_Role`). GigaLibs is better only where it
is proven better:

1. **First value without a consultant** (T11, X2): a new workspace reaches M1a unaided, measured.
2. **Versioned workspace configuration** with preview and rollback (S5), beyond iDempiere's in-place customization.
3. **Scoped, delegated administration at scale** (R2, R13–R15) with segregation of duties (R3).
4. **One inbox for all work** (X4) and **search everywhere** (X5).
5. **Field work offline on a phone** (X7).
6. **Visible integration:** posting state and reconciliation on every financially relevant document (E2–E5).
7. **Places native** (T3, M-GEO): site-scoped access and geofenced time.
8. **Security by construction, verified per module:** signed per-call context, forced row-level security where the
   access-path matrix says so (D6), maker-checker minimums (D3).
9. **Measured usability** (X2): faster tasks, fewer errors, less help, better recovery.

## 8. What is already built (start line)

WI-OI-120n batch 1 (`7485aec`, awaiting its security review), F0 metadata windows in Inventory, Catalogue and Finance,
U7 Catalogue and U12 general ledger on UAT, U19a CMMS routes, organization units and grants (ADR-0018), places
(ADR-0006), the discovery journey (WI-OI-120m).

## 9. Review findings (version 1) and how version 2 answers them

| Finding | Version 2 |
| --- | --- |
| Order broke its own dependencies (D6 before E1; M1 needing D12 and D13 after M5; D4 needing U29 later) | §4 dependency-checked; E2 before M-FIN1; CMMS and Workforce slices inside M1; AR runtime (M-AR0) before AR |
| Role union could widen authority; inheritance, delegation, revocation unspecified | D1 scope-bound assignments; R2–R4 |
| A12 conflicts with owner-accepted ADR-0018 | D2 as an ADR-0018 amendment; R11 implements it only after approval |
| Security review "before production" weaker than the cards' "before deploy" | §1 keeps "before deploy"; interim UAT reviewer named by the owner |
| Scope enforcement too narrow | D6 access-path matrix; R5 per module with stale-version, shared-record, export, job and cache tests |
| Approval policy gaps (minimums, currency, accumulation, splits, versions, parallel store) | D3; R6 through Configuration Studio governance |
| Master-data moves without migration design; places and parties ambiguity | D9 template; D4 place and party rules (facility details stay in CMMS; snapshots on documents) |
| Ownership after implementation (stock, invoices) | D4 before T5, T7; Inventory commands before CMMS cutover |
| Dictionary completeness (U5 customization, overlays, recovery) | S5 |
| Generated gateway could expose internal routes | S15: explicit exports with policy; equivalence and exposure tests |
| Functional and parity rows without cards | D6 parity register; R7, R9, S8, M-ANA, M-GEO, M-U29 per module |
| Production and SaaS lifecycle missing | O1–O7 from Stage 0; T8, T9 |
| Definition of 100 % (Ahead without evidence; "zero bugs"; G7 inside a candidate) | §6; G5, G6, G7 separate |
| Posting semantics; source version missing from the unique index | E2 posting policies and version identity; E3 failure cases |
| Money and quantity conflated | S3 and S4 separate |
| Overlaps and sizes without basis | One owner per capability; sizes relative and re-estimated after discovery |
| UX claims unmeasured; "no codes" too broad; identical layouts | X1, X2 |
| Explainable access could disclose | R12 within authorized context; R8 same "not found" |
| M1 bundled too much | M1a, M1b, M1c |
| Inaccurate claims in the analysis (customization, relays, forced RLS, field permissions, route count) | Corrected in `platform-parity-and-beyond-plan.md` |
