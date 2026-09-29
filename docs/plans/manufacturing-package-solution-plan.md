# Manufacturing package on an industry-agnostic core: solution and implementation plan

Status: Proposed. This is G2 input for `WI-OI-079` and the work items in §7. It does not authorise Build.  
Date: 2026-09-28  
Prepared by: Claude, working in the roles `solution_architecture`, `developer_platform`, `requirements_spec` and
`web_experience`, sequenced as `agile_delivery_orchestrator` (`.pi/agents/`).  
Needs:
- the owner's approval;
- independent review by Solution Architecture, Security & Privacy, Backend/Data, Web/Accessibility, QA/SDET and
  Product.

## 1. What the owner asked for

1. **One shared, industry-agnostic core, plus business modules chosen per client.**
   - A client is pitched modules and gets the core plus the modules they want.
   - Another industry (for example event crewing or healthcare) takes the core without the manufacturing modules.
   - A developer builds a new module on the core without editing the core.
2. **Manufacturing first, as a whole package.** Scope (owner-approved, 2026-09-28): Expert Implementation, CMMS,
   Enterprise Asset Management, AI-Powered Maintenance, Integrations Marketplace, Asset Management, Work Order
   Management, Parts Inventory Management, Industrial Controls and IoT, Checklists and Inspections, Reporting,
   Facility Maintenance, Resource Planning, Preventive Maintenance, Vendor Management.
3. **Mobile first** for people on the floor. **Admin with configuration** for managers and administrators.

## 2. Package map

Status is from the repository on 2026-09-28. Release waves are in §6.

| Package item | What a plant gets | Owning module | Today | Wave |
| --- | --- | --- | --- | --- |
| Work Order Management | Create, assign and track work on desktop and phone, with tasks, parts, labour, photos and history | Maintenance (CMMS) | Work orders exist; no mobile; no requests | 1 |
| Preventive Maintenance | Time- and meter-based schedules that create work orders by themselves; PM compliance | Maintenance | Schedules exist; generation is manual | 1 |
| CMMS | Requests from operators, planning, the technician app | Maintenance + Workforce | Requests are a placeholder | 1 |
| Asset Management | Register, hierarchy, history, documents, meters | Maintenance (asset capability) | Register, hierarchy and meters exist | 1–2 |
| Expert Implementation | Import, setup wizard, manufacturing template, sandbox tenant | Implementation kit (core tools + pack) | Import exists but is frozen (WI-OI-043) | 1 |
| Reporting | Backlog, overdue, PM compliance, MTTR, planned vs reactive, cost; dashboards and scheduled reports | Analytics foundation + maintenance KPI pack | API overview only; screen is a placeholder | 1–2 |
| Parts Inventory Management | Storerooms, stock, reorder points | Inventory module (extracted from CMMS) | Parts and stock ledger exist in CMMS | 2 |
| Vendor Management | Vendors and contractors, their documents and contracts, work assigned to them, purchasing | Procurement & Vendors module | Placeholder; Supplier/PO tables sit in the core database | 2 |
| Checklists and Inspections | Checklist builder, inspection rounds, failures raising corrective work, permits and lock-out/tag-out (LOTO) | Inspections & Safety module | Permits and LOTO built by the other stream, unreviewed | 2 |
| Resource Planning | Planning board: work matched to technicians by skill, shift and availability | Workforce + Maintenance | Workforce scheduling exists; the planning board is a placeholder | 2 |
| Enterprise Asset Management | Criticality, warranties, downtime, cost per asset, MTBF, asset health | Maintenance (asset capability) | Missing | 2 |
| Facility Maintenance | The same product configured for buildings and campuses | Facility pack (configuration only) | Missing | 2 |
| Integrations Marketplace | Catalogue of modules and connectors: ERP, accounting, payroll, webhooks, public API | Connector Hub + marketplace page | Hub exists; page is a placeholder | 2 |
| Industrial Controls and IoT | Sensors and PLC tags mapped to assets; thresholds raise work orders; run-hour PM | Condition Monitoring module + Connector Hub + analytics time series | Webhook and polling ingestion and a time-series table exist | 3 |
| AI-Powered Maintenance | Work orders from text or photo; failure-code suggestions; asset-history summaries; PM drafts from manuals | Core AI gateway + actions registered by modules | `ai-chat-core` has prompt tools only | 3 |

## 3. Target architecture

```text
Solutions (configuration)   manufacturing pack · facility pack · later: event crewing, healthcare …
                            wording, asset classes, codes, PM and checklist templates, KPIs, roles, dashboards
────────────────────────────────────────────────────────────────────────────────────────────────────────────
Business modules            Maintenance (work orders, requests, PM, assets/EAM) · Inventory · Procurement & Vendors
(separate services,         Inspections & Safety · Condition Monitoring · Workforce · (existing: AR, Spend, Tax …)
own schema and role)
────────────────────────────────────────────────────────────────────────────────────────────────────────────
Core (every client,         identity and access · tenancy and entitlements · audit and evidence · metadata
no industry logic)          (fields, catalogues, forms/checklists, wording) · rules and workflow · events · places
                            · parties · files · notifications · search · analytics facts · integration runtime ·
                            AI gateway · web shell + mobile shell · module registry and SDK
```

### 3.1 Ownership decisions: one owner per concept (ADR-0001 rule 6)

| Concept | Owner | Reason |
| --- | --- | --- |
| People, users, roles | Core identity; workers are Workforce resources (ADR-0003) | Unchanged |
| Organisations and contacts (vendors, contractors, customers) | Core **parties** | Procurement, AR and Workforce (contractor companies) all need them; no module copies |
| Places: sites, buildings, lines, rooms | Core, by promoting Geospatial | Every industry has places; CMMS already references place ids |
| Assets | Maintenance module, as a separate capability with its own contract (`assets.v1`) | Splitting now costs a migration and brings no client value. The contract allows a later split if a client needs assets without maintenance |
| Parts and stock | Inventory module, extracted from CMMS in Wave 2 | Facilities, logistics and hospitality reuse stock without maintenance |
| Requisitions, purchase orders, receiving, vendors | Procurement & Vendors module; the core database's Supplier, PurchaseOrder and GoodsReceipt tables move there | Business data does not belong in the core; Spend Management covers expenses and cards, not purchasing |
| Checklists and forms | Core metadata foundation, **one** engine; the Inspections module owns rounds and results | Inspections, permits, work-order checklists and other industries share one engine |
| Rules and workflow | Core. One rules engine and one workflow runtime, chosen in ADR-0013; the others are frozen | Today there are three rules and four workflow implementations |
| Sensor readings | Core analytics time series; the Condition Monitoring module owns sensors, thresholds and alarms | Readings are high-volume facts; alarms are business decisions |
| Money | No general ledger (roadmap decision). Costs are recorded per work order and asset, and exported to the ERP | Works alongside the ERP |

### 3.2 Rules the audits enforce

- Dependencies point one way: solution → modules → core.
- Modules do not import each other or read each other's schemas. They use contracts, APIs and events.
- Modules extend the core only through manifest-declared extension points: navigation, routes, slots, admin
  pages, mobile screens, permissions, catalogues, events, AI actions.
- Money, tenancy, security, audit and approvals stay in reviewed code (ADR-0002). Configuration and AI cannot
  bypass them.
- The core API is versioned. A breaking change needs a deprecation window.

## 4. Core changes (industry-agnostic work)

| # | Change | What it involves | Evidence today | Lead role / reviewers |
| --- | --- | --- | --- | --- |
| C1 | Layering and ownership (ADR-0013) | <ul><li>Label the 97 live packages core, module, solution or tooling</li><li>Dependency-direction audit</li><li>Decisions in §3.1</li></ul> | `scripts/verify-package-dependencies.mjs` checks declared dependencies only | solution_architecture / developer_platform, qa_spec |
| C2 | One module manifest | <ul><li>`module.yaml` v1 becomes the single source</li><li>`platformModuleCatalog` and registry entries are generated from it</li><li>Audit of manifest ↔ code consistency</li></ul> | Three unconnected formats: `module.yaml`, `packages/module-registry`, `packages/contracts/src/modules` | developer_platform / api_contracts |
| C3 | Module SDK | Extract into `@gigalibs/module-sdk`:<ul><li>signed-context guard</li><li>tenant database session</li><li>schema-version check</li><li>audit and outbox command</li><li>inbox, relay and retention</li><li>health</li><li>sync change feed (C5)</li></ul>CMMS and Workforce adopt it, with certifications unchanged | Copied in CMMS and Workforce `relay/*`, `database/*`, `runtime-config.ts` | developer_platform, backend_domain / qa_spec, Security |
| C4 | Web extension points | <ul><li>The shell builds navigation, routes, admin pages and slots from manifests</li><li>Module screens move into module web packages</li><li>One generic gateway route table</li><li>Remove the 15 CMMS references from shell files</li><li>`web` no longer depends on module services</li></ul> | Hand-edited `lib/*-proxy.ts`, `components/<module>`, AppSidebar | web_experience, developer_platform / Web/Accessibility |
| C5 | Mobile shell and offline sync (ADR-0014) | Installable web app (PWA) with an offline store and a sync protocol. See §5.1 | No mobile client | web_experience, solution_architecture / Security, qa_spec |
| C6 | Metadata adoption | <ul><li>Custom fields on assets and work orders (WI-OI-075)</li><li>Tenant catalogues: work-order types, priorities, failure, cause and remedy codes, downtime reasons, asset classes (WI-OI-076)</li><li>One forms and checklist engine</li></ul> | ADR-0002 framework has no CMMS adopter; three form engines | plugin_runtime, backend_domain / Backend/Data |
| C7 | Core database cleanup | Move Supplier, PurchaseOrder, GoodsReceipt, SupplierInvoice and AP-match tables into Procurement with forward-only migrations (copy, verify, switch, retire). Other business tables (cart, orders, chat, knowledge base) stay frozen and out of solution builds | 116 control-plane models include them | solution_architecture, data_portability / Backend/Data |
| C8 | Solution builds | `solutions/<name>.yaml` (core version, modules, packs) generates the web image, services and migrations for only those modules | Every image contains every module | developer_platform, release_operations |
| C9 | `module:new` and conformance | Generator for manifest, API, schema and role, contracts, web and mobile packages, tests and a Docker service. A conformance suite gates listing | `packages/cli` has no template | developer_platform / qa_spec |
| C10 | Integration runtime | <ul><li>Connector Hub becomes the core integration foundation</li><li>ERP connector framework</li><li>Sensor ingestion (MQTT/OPC UA gateway → webhook) into the analytics time series</li></ul> | Hub has webhook, polling and idempotency | integration_connectors / Security, infrastructure_observability |
| C11 | AI gateway (ADR-0015) | <ul><li>Provider abstraction and tenant opt-in</li><li>Data-classification filter</li><li>Only manifest-declared module actions, always confirmed by a human, all audited</li></ul> | Prompt tools only | plugin_runtime, trust_safety_automation / Security |

## 5. Mobile first and admin configuration

### 5.1 Mobile (phone first, tablet supported)

**Approach:** an installable web app in the same Next.js shell, under an `/m` route group, contributed by modules
through the manifest.
- The service worker pins the app shell per build, so a stale server can no longer serve missing chunks.
- A native wrapper (Capacitor) is added only if app-store presence becomes a requirement.

| Persona | Mobile screens |
| --- | --- |
| Operator / requester | Report a problem on an asset with a photo → follow status |
| Technician | My work today; work-order detail (steps, checklist, parts used, labour timer, photos, notes, sign-off); asset lookup with history; meter reading; clock in at site |
| Inspector / safety | Inspection rounds offline; pass or fail with evidence; a failure raises corrective work; permits and LOTO steps |
| Storeroom | Issue and return parts |
| Supervisor | Approve requests and timesheets; reassign work |

**Offline sync (ADR-0014):**
- **Scope.** The device keeps only the user's scope: assigned work, the related assets, checklists, a parts
  subset and places.
- **Pull.** A per-module change feed with cursors, provided by the SDK.
- **Push.** Queued commands carry client idempotency keys, following the proven punch and `requestKey` pattern.
  - The server validates every state change.
  - A rejected command is shown to the user with the server's state, never silently overwritten.
  - Append-only entries (labour, parts used, readings, checklist answers, photos) cannot conflict.
- **Security.**
  - Short-lived device sessions.
  - Local data is wiped on sign-out or tenant switch.
  - Scope and quantity limits on what is cached.
- **Quality bar.**
  - WCAG 2.2 AA at 360 px width.
  - Works on a mid-range Android phone.
  - Measured sync time.

### 5.2 Desktop: planners, managers, storeroom, purchasing

- Work-order list and board.
- Planning board and calendar (Resource Planning).
- Asset register and asset detail with history, cost and downtime.
- PM schedules and compliance.
- Inventory and purchasing.
- Vendors and contractors.
- Inspection results.
- Reports and dashboards.

### 5.3 Admin configuration

All admin configuration runs on the core configuration lifecycle: draft → validate → preview → publish →
activate, versioned and audited (ADR-0002).
- **Setup wizard (Implementation):** sites and locations, import, users and roles, catalogues, PM templates.
- **Asset classes and custom fields;** criticality scale.
- **Catalogues:** work-order types, priorities, failure, cause and remedy codes, downtime reasons, units.
  Lifecycle states stay fixed; their labels are configurable.
- **Templates:** PM templates and the checklist builder.
- **Access:** request-portal settings; roles, permissions and persona home pages (WI-OI-077).
- **Rules:** notification rules; approvals on work orders and purchase orders (WI-OI-078).
- **Vendors:** onboarding requirements (insurance, certificates).
- **Integrations and IoT:** integrations, API keys and webhooks; sensors and thresholds.
- **Module entitlements.**

## 6. Implementation plan

Sizes are rough, for one team working in parallel streams. They will be re-estimated after owner decisions D1–D11.

**Precondition (D1):** commit the current work, with one agent in the repository. C3 and C4 refactor CMMS,
Workforce and the web shell, and those are uncommitted and shared with another agent today.

### Wave 0: core foundation (about 5–6 weeks)

- C1, C2, C3, C4, C5 (shell and sync protocol), C8 (manufacturing solution file) and C9.
- **Exit:**
  - CMMS and Workforce run on the SDK, and every existing certification passes unchanged.
  - A `manufacturing` build and a build without CMMS both start.
  - A generated sample module appears in navigation with no shell edit.

**Trade-off, stated plainly:** doing the core first moves the first plant in production back by about 6 weeks
compared with `WI-OI-079`'s lean path. Every later module and industry becomes cheaper, which is the owner's
business model.

### Wave 1: Release 1, maintenance essentials (about 10 weeks; first design-partner plant)

- Maintenance requests.
- PM automation (time and meter triggers, compliance).
- The technician mobile app, offline.
- The implementation kit: import of assets, parts, PMs and locations, plus the setup wizard and the
  manufacturing template.
- Custom fields and catalogues (C6).
- Maintenance KPIs v1.
- P9 (`WI-OI-072`) on the manufacturing UAT tenant.

**Exit:** the Release 1 acceptance in `WI-OI-079`, on production hosting.

### Wave 2: Release 2, competitive parity (about 12–14 weeks)

- **Modules:** Inventory module (extraction, storerooms, reorder), and the
  Procurement & Vendors module (with C7).
- **Planning and assets:** the Resource Planning board, and EAM (criticality, warranties, documents, downtime,
  cost, MTBF).
- **Safety and reporting:** the Inspections & Safety module, and Reporting v2 (dashboards, scheduled reports).
- **Proof of configuration:** the facility pack. A second solution must need no code.
- **Marketplace:** Integrations Marketplace v1, with the first ERP connector, webhooks and public API docs.
- **Access and approvals:** custom roles and persona navigation, and approval hooks.

### Wave 3: Release 3, differentiation (about 12 weeks)

- Condition Monitoring and IoT (C10): sensors, thresholds, alarms → work orders, run-hour PM.
- AI maintenance assistant (C11).
- Reliability analytics: failure-code Pareto, bad actors, MTBF trends.

## 7. Work items to register when this plan is approved

| Work item | Title | Wave | Lead role | Required reviewers |
| --- | --- | --- | --- | --- |
| WI-OI-080 | ADR-0013 layering, ownership and dependency audit (C1) | 0 | solution_architecture | developer_platform, qa_spec, Product |
| WI-OI-081 | Module manifest v1 and generated catalogue (C2, C8) | 0 | developer_platform | api_contracts, release_operations |
| WI-OI-082 | Module SDK; CMMS and Workforce adoption (C3) | 0 | developer_platform | backend_domain, Security, qa_spec |
| WI-OI-083 | Web extension points and module web packages (C4) | 0 | web_experience | developer_platform, Web/Accessibility |
| WI-OI-084 | Mobile shell and offline sync, ADR-0014 (C5) | 0 | web_experience | solution_architecture, Security, qa_spec |
| WI-OI-085 | `module:new` generator and conformance suite (C9) | 0 | developer_platform | qa_spec |
| WI-OI-086 | Maintenance requests | 1 | backend_domain | web_experience, tenant_identity_access |
| WI-OI-087 | PM automation and compliance | 1 | backend_domain | plugin_runtime, qa_spec |
| WI-OI-088 | Technician mobile work orders | 1 | web_experience | backend_domain, Web/Accessibility |
| WI-OI-089 | Implementation kit: import, setup wizard, manufacturing template | 1 | data_portability | web_experience, Backend/Data |
| WI-OI-075 | Custom fields on assets and work orders (C6) | 1 | plugin_runtime | Backend/Data, Security |
| WI-OI-076 | Tenant catalogues (C6) | 1 | backend_domain | Product |
| WI-OI-090 | Maintenance KPIs v1 | 1 | backend_domain | web_experience, Product |
| WI-OI-091 | Inventory module | 2 | backend_domain | solution_architecture, Backend/Data |
| WI-OI-092 | Procurement & Vendors module and core database move (C7) | 2 | backend_domain | solution_architecture, data_portability, Finance |
| WI-OI-093 | Inspections & Safety module (including permits and LOTO review) | 2 | backend_domain | trust_safety_automation, web_experience |
| WI-OI-094 | Resource Planning board | 2 | web_experience | backend_domain |
| WI-OI-095 | Enterprise Asset Management | 2 | backend_domain | Product |
| WI-OI-096 | Reporting v2 | 2 | backend_domain | web_experience |
| WI-OI-097 | Facility pack (configuration only) | 2 | requirements_spec | Product, qa_spec |
| WI-OI-098 | Integrations Marketplace v1 and first ERP connector | 2 | integration_connectors | api_contracts, Security, documentation_enablement |
| WI-OI-077 / 078 | Custom roles and persona navigation / approval hooks. WI-OI-077 also takes the design retired with platform-rbac (ADR-0016 F6, WI-OI-102g): custom roles with a role-permission mapping, per-user permissions, resource-level ACLs and impersonation sessions | 2 | tenant_identity_access / plugin_runtime | Security |
| WI-OI-099 | Condition Monitoring and IoT (C10) | 3 | integration_connectors | infrastructure_observability, Security |
| WI-OI-100 | AI maintenance assistant, ADR-0015 (C11) | 3 | plugin_runtime | trust_safety_automation, Security |

Every item passes G0–G7. `qa_spec` designs the tests independently. `release_operations` and
`infrastructure_observability` own hosting and release, and `documentation_enablement` owns the implementation
and admin guides.

## 8. Owner decisions

D1–D7 are unchanged from `WI-OI-079`: commit and one agent; permits and LOTO; the import unfreeze; pay output;
production hosting; design-partner plants; the freeze list. New:

| # | Decision | Recommendation |
| --- | --- | --- |
| D8 | Approve Wave 0 before Release 1 (core first) | **Approved 2026-09-28.** WI-OI-080 active; WI-OI-081 to WI-OI-085 registered |
| D9 | App-store presence for the mobile app | No for Release 1; the installable web app first |
| D10 | First ERP to integrate | The design-partner plant's ERP |
| D11 | AI provider and data policy | Decide in Wave 2, before ADR-0015 |

## 9. Not doing

- Runtime microfrontends or third-party plugins running inside the core.
- A general ledger.
- Per-client code forks.
- Sensor hardware of our own (partner gateways only).
- An AI app builder that invents business behaviour (ADR-0002).
- Unfreezing modules outside the package unless a client needs them.

## 10. Details added by the planner, not in the owner's list (owner to approve or cut)

The owner's scope is the 15 items in §1. The details below are Claude's interpretation and are **not approved**.
Each one stays out of a work item's G1 scope unless the owner approves it.

| Detail | Placed under | Source |
| --- | --- | --- |
| Maintenance requests from operators | Work Order Management / CMMS | Already an existing CMMS capability (`maintenance-requests` in `module.yaml`; placeholder screen `/cmms/requests`) |
| AI features: work orders from text or photo, failure-code suggestions, history summaries, PM drafts from manuals | AI-Powered Maintenance | Planner's interpretation of the item |
| Permits and lock-out/tag-out | Checklists and Inspections | Built by the other stream; decision D2 |
| Reliability analytics (failure Pareto, bad actors, MTBF trends) | Reporting / EAM | Planner's interpretation |
| Setup wizard and sandbox tenant | Expert Implementation | Planner's interpretation |
| Custom roles, persona navigation, approval hooks (WI-OI-077/078) | Admin configuration | Earlier WI-OI-074 design |
| Clock-in at site on the phone | Mobile | Existing Workforce capability |

Removed on 2026-09-28 because nobody asked for them:
- **QR codes and scanning.** Suggested by UpKeep's page and the planner's own assumption.
- **Free requester seats.** A pricing decision, not the planner's to make.
- **Voice reporting, cycle counts and reservations.**

