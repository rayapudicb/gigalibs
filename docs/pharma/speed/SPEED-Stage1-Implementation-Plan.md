# How to read this document

This is the development plan for **SPEED Stage 1** (predictive desk screening), built as a **separate module and
product inside GigaLibs**. It turns three inputs into ordered, testable work:

- **the requirements:** SPEED-BRD-FRD-001 v0.1, which stays the requirements baseline (URS and FRS);
- **the architecture:** the alignment document `SPEED-Stage1-Architecture-Alignment` (card WI-OI-120bn), which places
  each requirement in GigaLibs;
- **the behaviour and the UI:** the clickable mock (`SPEED-Desk-Screening-Prototype.html`), which fixes what each
  screen and action does and how it looks;
- **the owner's source documents:** the SPEED SaaS Architecture Blueprint BP-01 (19 October 2026), the handwritten
  Stage 1 note and the five-step reference route, cross-checked in section 9;
- **the screen specifications:** `SPEED-Stage1-Screen-Specifications` (WI-OI-120bt), which define every window, panel,
  state and message precisely for S3 to S7.

Requirement IDs (BR-, BRL-, FR-, NFR-, TC-, BO-) are the BRD's own. Decisions D1 to D6 are the alignment document's
(section 4) and D7 to D9 are in section 9. **The owner approved all nine as recommended on 20 October 2026.**

<!-- pagebreak -->

# 1. Summary

- **A product of its own on the shared core.**
  - SPEED is the module `process-safety-screening` (display name "SPEED", configurable), listed in the module catalogue
    as an **optional module** (plan v3 tier 3), switched on per workspace by entitlement.
  - It owns its schema `gigalibs_speed` and its API, and uses the core for sign-in, tenancy, roles, audit, metadata
    windows, events, jobs and files.
  - It talks to other modules only through their APIs and events (section 2).
- **Real data, real operations.**
  - Every record is created, read, updated and archived through the module's API, stored in PostgreSQL with forced
    row-level security, and audited with old and new values and a reason.
  - Every number comes from the engine package, recomputed on the server.
  - The full API is in section 4.4.
- **No hard-coding** (section 4.5).
  - Screening criteria, reaction classes, interaction rules and energetic groups are **versioned, cited data**.
  - Display texts come from settings and translations.
  - Tenants, sites and users come from the core.
  - The only constants in code are physical ones, such as IUPAC atomic weights (a versioned, cited table) and the gas
    constant.
- **The mock is the UI, and metadata drives it** (section 3):
  - the screens keep the mock's layout, flow and look (it was built on GigaLibs' own theme);
  - every window, tab, field, label, action and permission is declared in the module's dictionary;
  - the calculation panels (gate, OB chart, thermal tiles and ladder, interaction matrix, green scorecard, dossier
    preview) are registered components that the dictionary places on tabs. That needs one platform addition,
    metadata panels (S2b);
  - the mock's demo-only parts are dropped: the role switcher, the journey guide, reset, browser storage and its
    illustrative data.
- **Nine R1 slices, then six R2 slices** (section 5). The engine package (S1) can start first, in its own worktree.
  The platform audit (S2) must land before the module's schema goes live (S3).
- **Where it runs:**
  - development and tests use the isolated `gigalibs-test` stack;
  - the pilot runs on a dedicated `speed-lab` instance on the lab's network (D1).
  - SaaS workspaces can have it by entitlement later, if the owner decides to.
  - It is never used for testing on UAT, which is the SaaS production.

<!-- pagebreak -->

# 2. Alignment with the core and the existing modules

## 2.1 Core services SPEED uses (nothing rebuilt)

| Core service | What SPEED uses it for |
| --- | --- |
| Identity and sign-in (`auth-core`, tenant OIDC) | Sign-in through the site's AD FS or Entra ID; administrator-created accounts for the pilot (W2 decision) |
| Tenancy and entitlements | `process-safety-screening` is a catalogue module; routes and navigation answer only for entitled workspaces |
| Roles and permissions (`rbac-core`, `rbac-nest`) | The roles and permissions in section 3.2, declared in `module.yaml`; role templates editable by the workspace administrator |
| Organisation replica (ADR-0018) | Sites and units for scope, the same as CMMS, Inventory, Orders and Procurement: a chemist sees their own site's projects |
| Module registry and manifest | Catalogue entry, gateway routes, migration pin, readiness, windows |
| Metadata windows and dictionary (S16 kit, `configuration-core`, `configuration-react`) | List, form and edit screens for projects, substances, routes, thermal data, libraries and criteria |
| Custom fields (`custom-fields-nest`) | A customer adds its own fields, for example an internal compound code, without code changes |
| Document lifecycle (`document-lifecycle`, ADR-0033 D2) | Route review states and guards (R2); library and criteria governance (R2) |
| Outbox and relay (`module-sdk`, ADR-0007) | Published events such as `speed.route.approved.v1`, which other modules consume |
| Jobs and queue (`jobs`, `queue`) | Dossier generation runs as a job, not inside a web request |
| Audit (`audit-core`, extended by S2) | Append-only, field-level audit with a reason |
| Object storage (the pattern of AR's `StorageService`) | Dossier files in the instance's object store; download through short-lived signed links; hash kept in the database |
| Platform settings (`platform-settings`) | Module settings: display name, default units, criteria version in force |
| Translations (`i18n`) | Every label and message |
| Gateway and module host | `/api/speed/v1/...` through the signed gateway; the module runs in `module-host` (`runtime.hosting: host`) |
| Migration runner and row-level security | Forward-only migrations with ledger rows; tenant isolation in the database |
| Solution bundles and industry packs | `solutions/speed-lab.yaml` for lab instances; a `pharma` industry pack for terminology, with no demo data |

## 2.2 Existing modules

| Module | Relationship | When |
| --- | --- | --- |
| Product Catalogue | Optional link from a SPEED substance to a stocked product, stored as the product's ID and read through Catalogue's API. No shared tables. | R2 |
| Connector Hub | ELN and LIMS exchange (file drop or REST, per site) | R3 |
| Analytics Studio | BO-1 to BO-4 dashboards from SPEED's events through a relay. R1 computes them inside SPEED (S9). | R2 |
| GigaLibs Assistant | SPEED's windows and actions become Assistant tools through the GU6 adoption kit ("open the route for X", "what is the MTSR of step 3") | After plan v3 W5 |
| Communications and notifications | "Route submitted for your review" and "returned" messages | R2 (with the workflow) |
| E-signature (prototype module) | Not used. The platform Part 11 service (S10) replaces it. | — |
| Universal Rule Pro (rules capability) | Considered for interaction rules and not used in R1: each rule needs its own citation and version, and must run offline in the browser. Can be revisited for customer-defined rules. | Later |
| Inventory, Procurement, Orders, Finance | No integration in Stage 1. Desk screening holds no stock and no money. | — |

## 2.3 Boundary rules (checked by `audit:layers`)

- SPEED never reads another module's schema, never imports another module's code, and never holds another module's
  database credentials. This is the defect WI-OI-120bp removes between Finance and Inventory.
- SPEED's events and API shapes are published contracts in `@gigalibs/contracts`.
- The engine package is module-owned (`config/package-layers.json`: `process-safety-screening`).

<!-- pagebreak -->

# 3. From the mock to the product

## 3.1 Screens

| Mock screen | Built as | API (section 4.4) | Release, slice |
| --- | --- | --- | --- |
| **Projects** (list, open, new route) | Metadata window `speed-projects` | Projects | R1, S3 |
| (new) **Substances** | Metadata window `speed-substances`; the formula and molar mass are computed by the engine | Substances | R1, S4 |
| **Route workbench**: header, status badge, step rail | Module web component `RouteWorkbench` at `app/(app)/speed/routes/[id]` | Routes, steps, latest result | R1, S4 |
| Tab **Route & gate**: steps, materials with roles and charges, conditions, element balance | `GatePanel` + `MaterialsEditor` | Steps, step materials, conditions; the server recomputes and stores a result | R1, S4 |
| Tab **Oxygen balance**: OB per material, alert band, energetic-group tags | `ObChart` | Results; energetic-group tags | R1, S5 |
| Tab **Thermal & runaway**: KPI tiles, temperature ladder, Stoessel class, gas, thermal-data source, mitigation card | `ThermalPanel`; thermal data as records (window `speed-thermal-data`) | Thermal data; results; mitigations | R1, S5 (acceptance R2, S11) |
| Tab **Interactions**: matrix, findings, focus a finding, document a control | `InteractionMatrix`; controls as records | Findings; controls | R1, S6 |
| Tab **Green metrics**: AE, RME, E-factor, PMI, yield, roll-up | `GreenMetrics` | Results | R1, S5 |
| Tab **Write-up parser**: paste, review, add to step | `WriteupParser`; parsing in the browser, nothing saved until the user confirms | Steps (on confirm) | R1, S8 |
| Tab **Dossier**: preview, download, JSON and CSV | `DossierPreview`; files generated on the server | Dossiers; exports | R1, S7 |
| **Libraries**: Reaction classes, Interaction rules (and energetic groups); propose, approve, apply | Metadata windows; governance as lifecycle actions | Libraries | Read R1 (S6), governance R2 (S12) |
| (new) **Screening criteria** | Metadata window `speed-criteria` | Criteria | Read R1 (S5), governance R2 (S12) |
| **Audit trail** | Window over the platform audit, filtered to the module; all or own entries, by permission | Audit | R1, S2 + S3 |
| **Outcomes** (BO-1 to BO-5) | `OutcomesPanel` | Outcomes | R1, S9 |
| Workflow bar: Submit, Withdraw, Start review, Return, Approve and sign, Reopen, New version | Document-lifecycle actions in the window's action bar | Route transitions | R2, S11 (with S10) |
| Modals: return with comments, sign, propose | Lifecycle action forms; the signature uses the platform e-signature (S10) | — | R2 |
| Reason for change (modal) | Required on every change to a GxP record; kept in the field-level audit | Every write carries `reason` | R1, S2 + S4 |
| **Dropped (demo only):** role switcher, journey guide, reset, browser storage, illustrative data | Real sign-in and roles; product help; module persistence; TC-12's charges kept with its test only | — | — |

## 3.2 Roles and permissions

| Mock permission | Roles in the mock | Module permission |
| --- | --- | --- |
| `editDraft`, `control`, `mitigation`, `newVersion` | Chemist, Engineer | `speed.routes.write` |
| (new) substances | Chemist, Engineer | `speed.substances.write` |
| `thermalData` | Chemist, Engineer, Safety reviewer | `speed.thermal-data.write` |
| `submit`, `withdraw` | Chemist, Engineer | `speed.reviews.submit` (R2) |
| `review`, `acceptMitigation` | Safety reviewer | `speed.reviews.approve` (R2; the reviewer is never the author) |
| `auditAll` | Safety reviewer, QA, Admin | `speed.audit.read`; everyone else `speed.audit.read-own` |
| `libPropose` / `libApprove` / `libApply` | Safety reviewer / QA / Admin | `speed.libraries.propose` / `.approve` / `.apply` (R2; also for criteria) |
| `settings` | Admin | `speed.settings.manage` |
| reading and running the engines | Every role that can read routes | `speed.routes.read`, `speed.engines.run` |

## 3.3 The mock's UI, driven by metadata

The mock is the UI specification. The product keeps its screens, layout, flow and visual language, built from
`@medusajs/ui` and the GigaLibs tokens, so it passes `audit:design-tokens`. What makes it metadata-driven:

| Layer | Declared in metadata (the dictionary, published and versioned) | Code (module web package) |
| --- | --- | --- |
| Navigation | Menu entries, order, the permission for each entry; hidden without the entitlement | — |
| Windows and tabs | The route workbench window, its tabs and their order (Route & gate, Oxygen balance, Thermal & runaway, Interactions, Green metrics, Write-up parser, Dossier), labels, visibility and read-only rules by status and permission | — |
| Records and fields | Projects, substances, routes, steps, materials, conditions, thermal data, libraries and criteria: fields, types, units, validation, required rules, pickers, custom fields | — |
| Actions | Recompute, generate dossier, export; in R2 the lifecycle actions, with their confirm texts | The handlers behind them (the module API) |
| Calculation panels | **Where** each panel appears (tab, section, order, span), **which** registered component, and its data binding (the route or result it reads) | **What** a panel draws: `speed.gate-panel`, `speed.ob-chart`, `speed.thermal-panel`, `speed.interaction-matrix`, `speed.green-scorecard`, `speed.writeup-parser`, `speed.dossier-preview`, `speed.outcomes` |

A customer can therefore reorder or relabel tabs, add fields, hide a panel for a role or translate every label
without code. A new kind of calculation view is a new registered component, reviewed like any code.

**Platform gap (verified 2026-10-20):** today a window's field placement chooses only among fixed input widgets
(`componentKey`: `text-input`, `select` …); a tab cannot host a module component. Slice **S2b** adds metadata panels:
a tab or section placement that names a component from a closed, registered catalogue, with typed props validated at
publish time. That is the same principle as plan v3's GU3 "cards from the renderer", so CMMS dashboards and Assistant
cards reuse it.

<!-- pagebreak -->

# 4. Target architecture

## 4.1 Code layout

```
packages/process-safety-engines/        module-owned; pure functions, no I/O, no business constants
  src/formula.ts  weights.ts            parser (brackets, hydrates); IUPAC atomic weights (versioned, cited data file)
  src/gate.ts                           extent, element balance, gate verdict
  src/ob.ts  thermal.ts  stoessel.ts    OB; Hess, ΔTad, MTSR, kinetics, TMRad, TD24; Stoessel class, ratings
  src/gas.ts  green.ts  rollup.ts       gas moles and volume; AE, RME, E-factor, PMI, yield; route roll-up
  src/interactions.ts                   evaluates library rules passed in as data
  src/writeup.ts  version.ts            deterministic write-up parser; ENGINE_VERSION
modules/process-safety-screening/
  module.yaml                           category business; optional tier; runtime hosting: host; roles; gateway; windows
  apps/api/                             NestJS on the module SDK (section 4.4)
  db/migrations/                        gigalibs_speed; structure only, no business rows; each migration records its ledger row
  dictionary/windows.mjs                projects, substances, routes, thermal data, libraries, criteria
  web/                                  RouteWorkbench, GatePanel, MaterialsEditor, ObChart, ThermalPanel,
                                        InteractionMatrix, GreenMetrics, WriteupParser, DossierPreview, OutcomesPanel
apps/workflow-platform/app/(app)/speed/ thin pages that mount the module's components
solutions/speed-lab.yaml                the core plus process-safety-screening, for lab instances
solutions/packs/industry/pharma.yaml    terminology and defaults; no demo data
```

Every engine function has the form `f(inputs, criteria, library, weights) → outputs`. Nothing is read from a database
or a global. The API supplies the versions in force, and the result records which versions it used.

## 4.2 Data model (`gigalibs_speed`, forced row-level security, tenant and site on every row)

| Table | Holds | Rule |
| --- | --- | --- |
| `projects` | Name, site, owner, status | Archived, never deleted |
| `substances` | Name, formula, optional structure (R2), CAS number, density; molar mass with the weights version used; optional Catalogue product ID (R2) | A substance used by an approved route cannot change; a new substance version is created instead |
| `routes` | Project, status, version, `supersedes_id`, author, opened, submitted and approved times, row version | An approved version is never edited; a new version copies it |
| `steps` | Route, order, reaction class, notes | Editable only while the route is a draft |
| `step_materials` | Step, substance, role, charge and unit | Same |
| `step_conditions` | Temperatures, times, dosing, pressure | Range validation (§15.1), with ranges taken from the criteria |
| `thermal_data` | Substance or mixture, kind (ΔH, onset, Cp …), value, unit, measured or estimated, source, citation, conservative flag (BRL-06) | A value without a source is refused |
| `screening_criteria` | Versioned criteria sets: OB alert band, Stoessel and severity thresholds, TD24 rule, gas limits; each value cited; status (unreviewed, approved, in force) | Exactly one set in force per workspace; results record its version |
| `reaction_classes`, `interaction_rules`, `energetic_groups` | Library entries with version, status and citation; an interaction rule also carries its finding text, control text and recommended Stage 2 test | Unreviewed entries are labelled in every result and dossier |
| `results` | Route version, step, engine version, criteria and library versions, inputs hash, outputs, time | **Immutable.** A recompute adds a row (NFR-10) |
| `findings` | Derived from a result: rule, materials, severity, citation | Recreated with each result; never edited |
| `controls`, `mitigations` | Text, linked finding or step, author; accepted by and when (R2) | Edited with a reason; never deleted once the route has been submitted |
| `dossiers` | Route version, format, object-store key, hash, watermark state, job status | Never regenerated in place |
| `outbox_events`, `inbox_receipts` | Module events (ADR-0007) | As in every module |
| Audit | The platform's append-only, field-level audit (S2) | The runtime role has SELECT and INSERT only |

## 4.3 Behaviour rules

- **Server-authoritative calculation.**
  - The browser runs the engine package for instant feedback (NFR-03: under 1 s for 15 steps).
  - Every save recomputes on the server with the same package and stores a result. The stored result is the record.
- **Gate first.** No thermal, OB, interaction or green result is stored for a step that fails the gate (FR-GATE-04).
- **Lifecycle (R2).**
  - The `document-lifecycle` graph is: Draft → Submitted → In review → Returned or Approved → Superseded.
  - The reviewer is not the author.
  - Approval is blocked while BRL-03 or BRL-04 is open, while a High finding has no documented control, or while a
    class 4 or 5 step has no accepted mitigation.
  - Each transition writes `speed.route.<transition>.v1` to the outbox in the same transaction.
- **Audit.** Every write carries a reason and is recorded with old and new values (FR-AUD-01).

## 4.4 API: real CRUD on real data

All routes sit under `/api/speed/v1` behind the signed gateway, and every one checks a permission:

- **Tenant and site** come from the platform context, never from the request body.
- **Creates and actions** take an idempotency key.
- **Updates** carry the row version (optimistic concurrency) and a `reason`.
- **Lists** are paginated and filterable.
- **Errors** follow the API conventions.
- **Contracts** are published in `@gigalibs/contracts`.
- **Windows:** where a window exists, its record routes are generated from the dictionary (S16). The rest are module
  routes.

| Resource | Operations | Permission | Notes |
| --- | --- | --- | --- |
| Projects | list, get, create, update, archive | `speed.routes.read` / `.write` | Archive, not delete (GxP) |
| Substances | list and search, get, create, update, new version, archive | `speed.routes.read`, `speed.substances.write` | Molar mass computed on the server |
| Routes | list, get (with steps and latest result), create, update header, new version, archive | `speed.routes.read` / `.write` | New version copies steps, materials and conditions |
| Steps | create, update, reorder, delete | `speed.routes.write` | Delete only while the route is a draft; audited |
| Step materials | add, update (role, charge), remove | `speed.routes.write` | Same |
| Step conditions | get, replace | `speed.routes.write` | Validated against the criteria in force |
| Energetic-group tags | set, clear (R1); derived from the structure (R2) | `speed.routes.write` | — |
| Thermal data | list, get, create, update, archive | `speed.thermal-data.write` | Citation required |
| Results | recompute (POST), get latest, get by ID, history | `speed.engines.run`, `speed.routes.read` | Never updated or deleted |
| Findings | list for a result | `speed.routes.read` | Read-only |
| Controls, mitigations | create, update, accept (R2) | `speed.routes.write`; `speed.reviews.approve` to accept | — |
| Route transitions (R2) | submit, withdraw, start review, return, approve and sign, reopen | `speed.reviews.submit` / `.approve` | Guards in section 4.3 |
| Libraries and criteria | list, get; import a cited pack (admin, audited); propose, approve, apply (R2) | `speed.routes.read`; `speed.libraries.*` | Import marks entries "unreviewed" |
| Dossiers | generate (job), status, list, download (signed link) | `speed.routes.read` | Hash checked on download |
| Exports | route as JSON, as CSV | `speed.routes.read` | Same model as the dossier |
| Outcomes | get (BO-1 to BO-4) | `speed.routes.read` | Computed from module data |
| Audit | list, filtered to the module | `speed.audit.read` / `.read-own` | The platform audit's query |
| Settings | get, update | `speed.settings.manage` | Display name, default units, criteria in force |

## 4.5 No hard-coding: the rules

1. **No business values in code.** No tenant, site, user, role, threshold, rule, library entry, unit default or display
   text. They are data (tables, settings, the dictionary, translations) with versions and citations where they are
   scientific.
2. **The only constants are physical ones.** The IUPAC atomic weights are a versioned, cited data file in the engine
   package, and the gas constant is a constant. The weights version is stamped on every result.
3. **No seeds in migrations.** Migrations create structure only.
   - The starter library and the starter criteria come from a cited pack, imported by an administrator through the
     API.
   - The import is audited, and everything it imports is marked "unreviewed".
   - Release requires the process safety specialist's review of every entry.
4. **No fallbacks.** If a criterion or library entry is missing, the result says so ("data gap"). The engine never
   substitutes a default.
5. **Test data lives in tests.** The TC-01 to TC-12 fixtures and TC-12's charges sit in the test folders. Nothing from
   the mock's `data.js` ships, and `audit:production-data` enforces it.
6. **Configuration per workspace, code per product.** A customer's differences (criteria in force, custom fields,
   labels, roles) are data in that workspace. There are no customer branches or customer builds.

<!-- pagebreak -->

# 5. Slices

Each slice is one card with tests that fail before and pass after, `pnpm verify` green, an independent review where
code ships, and evidence on the card. Sizes follow the alignment document: S ≤ 1 week, M 2–4 weeks, L 1–3 months.

## 5.1 R1: the non-validated pilot (D6 as recommended)

| Slice | Delivers (mock) | Main work | Proof | Depends on | Size | Agents |
| --- | --- | --- | --- | --- | --- | --- |
| **S1 Engines** | Every number on every tab | The engine package (4.1), taking criteria, library and weights as inputs; `ENGINE_VERSION`; package classified | TC-01 to TC-12; property tests (mass balance conserved, PMI = E-factor + 1, TMRad monotonic in temperature); 15 steps under 1 s; coverage ≥ 90 %; a missing criterion gives "data gap", never a default | None | M | `cheminformatics_specialist`, `process_safety_specialist`, `backend_domain`, `test_automation`, `code_reviewer` |
| **S2 Platform audit** | Audit trail; reason for change | Migration runner: manifest-declared append-only tables (SELECT and INSERT only) and a trigger that rejects UPDATE and DELETE; module SDK audit writer with old, new and reason; opt-in, so existing modules are unchanged | The runtime role cannot update or delete an audit row (integration test on `gigalibs-test`); every existing module's migrations and pins still pass | WI-OI-120bp landed | M | `developer_platform`, `security_engineering`, `gxp_validation_specialist`, `security_reviewer` |
| **S2b Platform: metadata panels** | The calculation tabs placed by metadata | Window contract: a panel placement (tab or section, order, span) naming a component from a closed registered catalogue, with typed props validated at publish; `configuration-react` renders it; the S16 checker validates it | A window with a registered panel renders it; an unregistered or mistyped panel is refused at publish; existing windows unchanged | None (no overlap with 120bp/120bq) | M | `developer_platform`, `api_contracts`, `web_experience`, `design_system`, `security_reviewer` |
| **S3 Module scaffold** | Projects; Audit trail; navigation; entitlement | `pnpm module:new process-safety-screening`; schema, row-level security and organisation replica; roles and permissions; gateway; settings; catalogue entry (optional tier); `speed-lab` bundle and `pharma` pack | Conversion, manifest and layer checks; tenant and site isolation tests; a permission test per role; a workspace without the entitlement gets 403 and no navigation | S1, S2 | M | `solution_architecture`, `backend_domain`, `api_contracts`, `web_experience`, `security_reviewer` |
| **S4 Input and gate** | Workbench, step rail, Route & gate tab, Substances, reason modal | Projects, substances, routes, steps, materials, conditions: the full CRUD in 4.4; `GatePanel`, `MaterialsEditor`; server recompute and result rows | FR-INP-01, 02, 04, 05, 06 and FR-GATE-01 to 06 acceptance; API tests for each operation (permission, tenant, concurrency, reason, idempotency); no result for a failing step | S3, S2b | L | `backend_domain`, `api_contracts`, `web_experience`, `product_designer`, `design_system`, `qa_spec` |
| **S5 Engine screens, thermal data, criteria** | Oxygen balance, Thermal & runaway, Green metrics; Screening criteria (read) | `ObChart`, `ThermalPanel`, `GreenMetrics`; thermal-data CRUD; criteria tables and the audited pack import; energetic-group tags | Screen values equal the S1 test values; every result stamps its engine, criteria, library and weights versions (NFR-10); colour is never the only signal; 1366 × 768 | S4 | M | `web_experience`, `design_system`, `process_safety_specialist`, `accessibility_testing` |
| **S6 Interactions and libraries** | Interactions tab; Libraries (read); controls | `InteractionMatrix`; findings; control CRUD; library tables, windows and the audited pack import (unreviewed) | TC-11; no rule without a citation; the "absence of a finding is not proof of safety" statement is shown | S5 | L | `process_safety_specialist`, `backend_domain`, `web_experience`, `licence_ip_reviewer` |
| **S7 Dossier** | Dossier tab, downloads, JSON and CSV | One dossier model; DOCX (`docx`, MIT) and PDF (`pdfkit`) generated as a job; object storage with hash; "DRAFT — NOT APPROVED" watermark on every page; two new pure engine functions, `actionList` (actions before kilo-lab, traced to rules) and `stage2Plan` (DSC, ARC, RC1 and gas tests), with their texts in the message catalogue and interaction tests from the library | FR-RPT-01 to 04; files open in Word and a PDF reader; the hash matches on download | S6 | M | `documents_lead`, `backend_domain`, `licence_ip_reviewer` |
| **S8 Write-up parser** (Should) | Write-up parser tab | Deterministic extraction in the engine package; the user confirms every value; no AI | At least 90 % of quantities correct on 20 annotated procedures (FR-INP-07, 08) | S4 | M | `cheminformatics_specialist`, `web_experience`, `test_automation` |
| **S9 Outcomes and pilot** | Outcomes page | `OutcomesPanel` from module data; `speed-lab` instance with offline image transfer, TLS at the lab proxy, backup and restore drill, deployment guide; pilot with one lab team | Pilot sign-off by the business owner; restore drill recorded | S7 (S8 optional) | M | `release_operations`, `documentation_enablement`, `onboarding_data_migration`, `gxp_validation_specialist` |

## 5.2 R2: the validated release

| Slice | Delivers (mock) | Main work | Size |
| --- | --- | --- | --- |
| **S10 Platform e-signature (Part 11)** | "Approve and sign" | Meaning, re-authentication, manifestation on the record and the dossier, record–signature binding; a platform service (D3) | L |
| **S11 Workflow** | Workflow bar, return and sign modals, mitigation acceptance, review notifications | The lifecycle graph and guards (4.3); outbox events; superseding on a new version; notifications | M |
| **S12 Library and criteria governance** | Propose, approve, apply | Lifecycle on library entries and criteria sets; QA approves; Admin applies; versions referenced by results | M |
| **S13 Structures** | Energetic groups found automatically; Catalogue link | RDKit WebAssembly (BSD-3) in the engine package: SMILES, MOL and Rxnfile to formula, energetic groups by SMARTS, CDXML through export if the build lacks it (FR-INP-03, FR-OB-04); optional Product Catalogue link | M |
| **S14 Benson estimates** | — | Group values with a checked licence; every value labelled as an estimate (FR-THM-02, BRL-05) | M |
| **S15 Validation pack** | — | Traceability generated from the BRD IDs in test names; IQ, OQ and PQ protocols for the customer's instance (GAMP 5 category 5) | M |

**R3** (unchanged from the alignment document): route comparison, ELN and LIMS through Connector Hub, single-PC mode,
Analytics dashboards, hand-off to SPEED Stage 2.

## 5.3 Order and parallel work

```
Track A (module):    S1 ──► S3 ──► S4 ──► S5 ──► S6 ──► S7 ──► S9
                                     └──► S8 (optional, before S9)
Track B (platform):  S2 ──┘ (before S3's schema goes live)        S10 ──► S11 ──► S12   (R2)
                     S2b ────────► (before S4's panels)
Design (no code):    product_designer specifications from the mock for S4 to S7, before each slice
```

- **S1 can start first.** It only adds a new package, so it can be built in a separate git worktree while another
  writer works on the main branch, and merged when that writer finishes.
- **S1 is done** (WI-OI-120br, `68be9379`).
- **S2 waits for WI-OI-120bp and WI-OI-120bq**, which are changing the module SDK now.
- **S2b can run now**, in its own worktree: it changes the configuration contracts and the window renderer, which
  that work does not touch (checked 2026-10-20).
- **Critical path:** S1 → S3 → S4 → S6 → S7 → S9 (two L slices).

<!-- pagebreak -->

# 6. Rules every slice follows

1. **Tests from the BRD's IDs.** Test names carry the requirement IDs, so the traceability matrix is generated, not
   written by hand.
2. **`pnpm verify` green:**
   - `audit:layers`: package classified; no cross-module import or schema access;
   - `audit:design-tokens`: `@medusajs/ui` and tokens replace the mock's own CSS;
   - `audit:production-data` and `audit:all-runtime-data`: no illustrative data and no silent fallback;
   - migration pins.
3. **Forward-only migrations**, structure only, each recording its own ledger row; no edit to a migration that has run
   on any shared instance.
4. **Every API route is tested** for permission, tenant and site isolation, concurrency and audit; the reviewer is
   never the author.
5. **No external calls at runtime** (NFR-01): no CDN, no cloud AI, no telemetry leaving the instance. Fonts and the
   RDKit WebAssembly file ship inside the images.
6. **Independent review:**
   - `security_reviewer` for every slice that ships code;
   - `gxp_validation_specialist` for S2, S10, S11 and S15;
   - `licence_ip_reviewer` for `docx`, RDKit and every library and criteria source.
7. **Where it runs:**
   - development and tests on `gigalibs-test`;
   - the pilot on the `speed-lab` instance;
   - never tested on UAT.

# 7. Before the first slice

| Item | Owner | Why it blocks |
| --- | --- | --- |
| ~~Decisions D1 to D9~~ | Owner | **Approved as recommended, 20 October 2026** |
| BRD points in alignment section 6 (R1 scope, the employer's name, the alert band citation, BRL-06 label, TC-12 charges) | Owner, process safety lead | S1's tests and the criteria pack depend on them |
| Sources and licences for libraries, criteria and Benson values | `licence_ip_reviewer`, `process_safety_specialist` | S5, S6 and S14 cannot ship unreviewed entries as reviewed |
| Session idle time-out (NFR-05: 15 minutes) | `security_engineering` | Must be confirmed in the platform session policy before the pilot |

# 8. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| SPEED competes with Phase 1 for the single writer | Phase 1 slips, or SPEED waits | D5; S1 in a separate worktree |
| Append-only audit changes the migration runner every module uses | A regression in all modules | Opt-in per table; every module's migrations rerun on `gigalibs-test` in S2 |
| RDKit WebAssembly size and CDXML support | Slow first load; CDXML not read | Lazy load; CDXML through ChemDraw export |
| Unreviewed library or criteria mistaken for reviewed | Unsafe screening | "Unreviewed" label in every result and dossier; release blocked until reviewed |
| The browser and the server disagree on a number | Two truths | One package for both; the server's result is the record; tests compare them |

<!-- pagebreak -->

# 9. Source documents cross-check

Checked on 20 October 2026 against three of the owner's documents:

- the SPEED SaaS Architecture Blueprint **BP-01** (19 October 2026, two pages);
- the handwritten Stage 1 note;
- the five-step reference route.

The BRD/FRD was curated from them, and this plan follows the BRD. This section shows that nothing in them is lost, and
what still differs.

## 9.1 BP-01's six pillars

| Pillar | Built as | Slices |
| --- | --- | --- |
| Safety: runaway, gas and decomposition risks before the lab | OB engine; thermal engine (ΔHrxn, ΔTad, MTSR, TMRad, Stoessel class, gas); interaction screener | S1, S5, S6 |
| Quality: auditable calculations, no spreadsheet versions | One engine version for the browser and the server; immutable, stamped results; append-only, field-level audit | S1, S2, S5 |
| Economy: atom economy and solvent intensity early | AE, RME, E-factor, PMI on the full bill of materials, work-up and washes included | S1, S5 |
| Robustness: cooling failure and adiabatic worst case | MTSR, TMRad and the Stoessel class for loss of cooling | S1, S5 |
| User-friendly: for chemists and process engineers | The mock's workbench; the write-up parser | S4, S8 |
| Fool-proof (Poka-Yoke): 100 % mole-balanced schemes | The gate locks every engine until the step balances (FR-GATE) | S4 |

## 9.2 BP-01's components and formulas

| BP-01 | Where it is built | Release |
| --- | --- | --- |
| 1.1 Reaction scheme parser (SMILES, Rxnfile, CDXML) with the mole-balance gate | Formula entry and the gate (S4); structures through RDKit (S13) | Gate R1; structures R2 (D6) |
| 1.2 Patent and write-up NLP into structured tables | Deterministic parser, user confirms each value (S8); AI extraction is decision D8 | R1 deterministic |
| 2.1 Oxygen balance | Engine (S1), panel (S5) | R1 |
| 2.2 Hess's law, with Benson group additivity for new molecules | Hess with cited ΔHf° values (S1); Benson (S14) | Hess R1; Benson R2 |
| 2.3 Predictive hazard screener: energetic groups and binary mixtures against literature and SDS | Energetic groups (manual tags R1, SMARTS R2), pair rules with citations (S6) | R1 |
| 2.4 Green metrics on the full bill of materials, including aqueous work-ups and washes | Engine (S1), scorecard (S5); work-up materials have the role "Work-up" | R1 |
| 3.1 Thermal and runaway dossier | Thermal panel (S5), dossier (S7) | R1 |
| 3.2 Interaction matrix and green scorecard | Matrix (S6), scorecard (S5) | R1 |
| 4. Formulas: OB % = −1600 / MW × (2x + y/2 − w); Hess; ΔTad = (−ΔHrxn × C0) / (ρ × Cp); TMRad = Cp R T0² / (q0 Ea); AE; E-factor; PMI = E-factor + 1; RME | Identical to the BRD's engine rules; TC-01 to TC-12 test them | R1 |
| OB alert band −160 % < OB % < +80 % ("mandates DSC/ARC testing") | A cited value in the screening criteria; it still needs its published source before release (alignment, section 6, point 3) | R1 |
| 5. Reference knowledge base and tech stack ("RAG corpus") | **Not reviewable:** the copy provided ends at the heading | D8, D9 |

## 9.3 What still differs (decisions for the owner)

| # | BP-01 or the note says | The BRD and this plan say | Recommendation |
| --- | --- | --- | --- |
| D7 | A **SaaS** system | BR-09 and NFR-01: lab network only, no data leaves the site | **One product, two deployments from the same code:** a SaaS workspace by entitlement for customers who accept it, and a dedicated lab instance (`speed-lab`) for those who do not. Route data is classified CONFIDENTIAL (unpublished chemistry). The pilot's deployment is chosen with the pilot customer. |
| D8 | Patent and write-up **NLP**; a **RAG** corpus | No AI in R1; a deterministic parser | R1 stays deterministic (S8). R2 may add AI extraction through the Assistant's AI layer: on lab instances a model that runs inside the instance; every extracted value confirmed by the user, never applied silently; validated by `ai_model_validation_specialist`. A retrieval corpus only over content the customer owns or has licensed. |
| D9 | References: Bretherick's Handbook of Reactive Chemical Hazards, Sax's Dangerous Properties, the NFPA fire protection guide, SDS (MSDS), the Journal of Loss Prevention, Process Safety Progress, the Journal of Hazardous Materials, Thermochimica Acta and the Journal of Thermal Analysis, IChemE, AIChE and DECHEMA proceedings | Library entries with citations (S6) | These works are copyrighted. The library holds **curated entries written by the process safety specialist, each citing its source** (work, edition, page), not copies of the text. Bulk loading only under a licence (`licence_ip_reviewer`). A customer's own SDS files attach to their substances. |
| — | Trademark action item (Classes 9 and 42; earlier internal use at a former employer) | BR-14 | Legal clearance before any commercial use. The display name is a setting, and the catalogue key stays `process-safety-screening`. Copies of BP-01 and the BRD shared outside should not name the former employer. |

## 9.4 The reference route

The five-step route is the end-to-end acceptance test, and it was also the mock's demonstration route:

1. 4-fluorobenzaldehyde, condensed with methyl isobutyrylacetate;
2. cyclisation with S-methylisothiourea in DMSO;
3. KMnO₄ oxidation in acetone;
4. substitution with N-methylmethanesulfonamide in NaOH and DMSO;
5. DIBAL-H reduction in toluene.

How it is used:

- It is **entered through the UI with real charges** from the lab write-up, never seeded.
- Its expected results come from the engine tests.
- It covers the step kinds the screener must handle: a strong oxidant, a metal-hydride reduction, and base with DMSO.
- **The expected findings are set by the process safety specialist**, not by this plan.
