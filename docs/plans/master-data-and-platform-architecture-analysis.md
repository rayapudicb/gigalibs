# Master data and platform architecture — 360° analysis and plan

- **Owner request (2026-11-03):** an in-depth analysis of two areas before more modules are built — (1) master data in
  GigaLibs and (2) how GigaLibs' architecture compares with iDempiere and MedusaJS v2 — and a plan that makes GigaLibs a
  future-proof product without compromising the system; a super-simple, Medusa-like UI for metadata is in scope as a
  low-priority analysis.
- **Evidence:** read-only queries on UAT 5180 (release f0035ec5, 366 workspaces), the GigaLibs source (branch
  `feat/frontline-suite`), the iDempiere source (`~/idem`) and the Medusa v2 project `mypint-platform`
  (`~/.gemini/antigravity/scratch/mypint-platform`, `@medusajs/framework` 2.15.2). Every finding below names where it was
  seen; nothing is taken from the earlier pasted analysis without checking it.
- **Outcome (2026-11-03):** the owner accepted every recommendation in §9 and set the country order. Decisions:
  ADR-0037–0040; execution plan with the three levels of master data, the final reference data list and what happens at
  workspace creation: `docs/plans/master-data-foundation-execution-plan.md`; cards WI-OI-152–162; hand-over
  `.pi/handoff/MASTER-DATA-FOUNDATION-HANDOFF-2026-11-03.md`.

## 1. Summary

1. **Master data exists but is not yet a product capability.** Each master lives with its owning module (correct), but
   there is no hub, no reference data in use, no governed starter data, no shared import, and — most important — no
   cross-module reference integrity for products, units and partners. Organization units are the one master distributed
   properly (versioned replicas in 12 modules); parties reach only Business partners (fixed today, QA-046).
2. **The building blocks are already in the code, unused or half-wired:** a checksummed platform reference store
   (countries, currencies, units, languages, time zones, tax jurisdictions) with **0 entries loaded**; product events
   **defined but never published**; a strong CMMS import engine used only by CMMS; external-id mapping tables in Products
   and Inventory; a pack system that only covers Workforce and Geospatial; a party merge model. The fastest path is to
   finish and generalize these, not to invent new ones.
3. **Architecture:** GigaLibs is already stronger than both references on tenant security and governed metadata, and its
   module isolation is stronger than Medusa's at runtime (separate services, schemas, row-level security, signed
   per-module contexts). It is far weaker on developer ergonomics: one field is declared by hand **six times in three
   naming styles**, and audits exist mainly to keep those copies consistent. Its missing piece versus Medusa is not
   isolation but **a model-first definition layer, a reference/link layer and a composable workflow layer**.
4. **Plan:** a Master Data Foundation (hub, reference data, governed packs, import kit, cross-module references,
   overlap reconciliation, missing masters) and a Platform Kit (model-first entities with a service factory, generated
   relays, reference validation), in that order, **before** new modules. The simple metadata UI comes last and builds on
   the model layer.

## 2. Fact-check of the pasted analysis

| Claim | Verdict | Evidence |
|---|---|---|
| Master data exists but is decentralized per module | ✅ | Each master has its own schema (`gigalibs_product_catalogue`, `gigalibs_inventory`, `gigalibs_finance`, …) |
| Persona filtering hides Products / Business partners | ⚠️ Partly | `generatedModulePersonas`: both list only `OPERATIONS_SUPERVISOR`; tenant admins and platform operators see every entry (`lib/module-navigation.ts:51`); executives never see them |
| A fresh tenant starts with empty tables | ✅ (worse) | 366 workspaces; units exist for **1**; `platform_reference_entries` has **0** rows |
| Products, units, categories, price lists tables | ✅ | `gigalibs_product_catalogue.products`, `uom_definitions`, `product_categories`, `price_lists` |
| Customers/vendors in `public."Party"` | ⚠️ | `public.parties`, `party_roles`, `party_addresses`, `party_contact_points`; Business partners keeps a replica (`party_references`) |
| Warehouses in `gigalibs_universal_inventory.warehouses` | ❌ | `gigalibs_inventory.warehouses` |
| Chart of accounts in `public."GeneralLedgerAccount"` | ❌ | The live chart is `gigalibs_finance.chart_of_accounts` (597 rows); `public.general_ledger_accounts` is legacy (8 rows) |
| Spaces in `gigalibs_cmms.spaces` | ❌ minor | `gigalibs_cmms.cmms_spaces` |
| `uom_type` PLATFORM_REFERENCE vs TENANT_CUSTOM | ✅ but unused | Column exists; **0** PLATFORM_REFERENCE rows anywhere |
| `PlatformReferenceVersion/Entry` models | ✅ but unused | Builder `scripts/build-platform-reference-data.mjs` (ICU/CLDR), loader service, read API — never loaded, no consumer |
| No bulk import tooling | ⚠️ | Importers exist for products, CMMS (rich), places, bank statements, staff invitations — none for partners, inventory, chart of accounts, people; no shared framework |
| Cross-module governance missing | ✅ (deeper) | `product.created/updated/archived.v1` defined in contracts, **never published or consumed**; no cross-module validation of `product_id` |
| Inter-service context is an HMAC header | ❌ | Ed25519-signed JWT (`alg: EdDSA`), audience per module, TTL ≤ 300 s, revocation check (`packages/auth-core/src/platform-context.ts`) |
| `TenantBoundaryGuard`, safe AST evaluator | ✅ | `packages/tenancy-nest/src/guards`, `packages/configuration-core/src/dictionary-evaluator.ts` |
| Medusa project uses `defineLink` | ❌ | `mypint-platform/apps/backend/src/links` holds only a README; its models reference each other by text id with copied names — the same pattern as GigaLibs |
| Medusa modules can be pulled out as microservices unchanged | ⚠️ | Medusa modules share one process and database by default; GigaLibs already runs modules as separate services |

## 3. Master data today — 360°

### 3.1 Inventory of masters

| Master | Owner | Store | Screen | Bulk import | Reaches other modules by | UAT data |
|---|---|---|---|---|---|---|
| Organization units | Control plane | `public.org_units`, `org_trees` | Settings › Organization | — | **Versioned replica** in 12 modules | 162 |
| Parties (customers, vendors) | Control plane | `public.parties` (+ roles, addresses, contacts) | — (Business partners screen) | — | Relay → Business partners `party_references` only | 9 |
| Partner accounts, credit | Business partners | `gigalibs_business_partners.*` | /business-partners | — | — | — |
| Products, categories, attributes | Products | `gigalibs_product_catalogue.*` | /products | ✅ preview/commit | **Nothing** (pickers call the lookup live) | 9 / 2 |
| Units of measure, conversions | Products | `uom_definitions`, `uom_conversions` | /products/units | — | Nothing | 8 (one workspace) |
| Price lists | Products | `price_lists`, `price_list_versions` | /products/price-lists | — | Nothing | 1 |
| Warehouses, locations | Inventory | `gigalibs_inventory.warehouses`, `locations` | /inventory | — | Nothing (lookup) | 12 |
| Chart of accounts, books, periods | General ledger | `gigalibs_finance.*` | /finance/* | — | Fiscal periods → Inventory replica | 597 |
| Assets, spaces, parts, classifications | CMMS | `gigalibs_cmms.*` | /cmms/* | ✅ rich engine | Nothing | 105 assets |
| Places (sites, zones) | Geospatial | `gigalibs_geospatial.spatial_nodes` | /maps | ✅ CSV | Nothing (not running on UAT until 02b3353a) | — |
| People, skills, calendars | Workforce | `gigalibs_workforce.*` | /gigaops/* | bulk invitations only | Nothing | 0 resources |
| Currencies, FX | Multi-currency (contained) + kernel | `gigalibs_currency.*`, `public.currency_exchange_rates`, `public.tenant_exchange_rates`, `gigalibs_finance.consolidation_fx_rates` | — | — | — | — |
| Tax jurisdictions, rates | Tax (contained) | `gigalibs_tax.*` | — | — | — | — |
| Platform reference sets | Kernel | `public.platform_reference_*` | — | builder + loader | read API, **no consumer** | **0** |

Inside a module, integrity is real (for example `inventory_items` has foreign keys to its own warehouses and locations).
Across modules there is none: `inventory_items.product_id`, order and purchase lines, standard costs and BOMs hold a
product id that nothing checks, and an archived product stays usable everywhere.

### 3.2 Reference data (countries, currencies, units, languages, time zones, tax jurisdictions)

- **Built well:** `packages/contracts/src/platform-reference` defines six sets with typed entries and provenance;
  `scripts/build-platform-reference-data.mjs` generates them from ICU/CLDR (no hand-typed values) with a checksum;
  `PlatformReferenceService.loadGeneratedSet` loads a whole set; `GET platform-reference/:setKey` serves it.
- **Not used:** 0 entries on UAT; no screen, picker or module reads it. Currency fields are free text with a `USD`
  default; units are per-tenant custom only; time zones and languages are lists inside settings code.

### 3.3 Starter data and packs

- **Packs** (`solutions/packs`, 10 industry + 6 country, 636 lines) configure **only** Workforce (vocabulary,
  certifications, pay rules) and Geospatial (place types), applied by the `*.pack-apply` kernel jobs. No pack carries
  units, product categories, chart templates, tax codes, payment terms or absence types.
- **Starter data lives in UI code:** the General ledger "starter chart" is a constant in
  `FinancialOperationsWorkspace.tsx` posted account by account from the browser; the starter absence types and asset
  classes added in WI-OI-148 are constants in the module workspaces. Useful today, but ungoverned (no version, no
  country variant, no audit of which set a workspace received).
- **iDempiere benchmark:** Initial Client Setup (`MSetup.java`) creates accounting from a CSV chart template (385 US
  accounts) with defaults, document types, calendar and periods, a partner group and standard partner, product
  category and tax category, warehouse, price lists and discount schema, project and finance set-up in one step, on top
  of the shared Client 0 reference data.

### 3.4 Import and export

| Where | Capability |
|---|---|
| CMMS `import-export/` | XLSX streaming and multi-sheet read/write, column registry, remembered column aliases, foreign-key and hierarchy resolvers, row validation, batch writer, background jobs, storage — **the best base for a shared kit** |
| Products | Preview → commit with idempotency, export |
| Geospatial | Place import (CSV) |
| General ledger | Bank statement import |
| Workforce | Bulk invitation preview/submit, pay exports |
| Products, Inventory | External id mapping tables (`*_reference_mappings`: source system + key → GigaLibs id) |

Missing: customers and vendors, warehouses, items and opening stock, chart of accounts and opening balances, people,
units, price lists. iDempiere has 16 import staging tables (`I_BPartner`, `I_Product`, `I_ElementValue`, `I_Inventory`,
`I_GLJournal`, `I_Asset`, `I_PriceList`, …) with one loader and templates.

### 3.5 Cross-module references and events

- Distribution patterns that work: organization replica (versioned, checksummed, per module), party relay (signed,
  idempotent inbox, version-ordered), projections (fiscal periods, AR invoices, receipts).
- Not applied to products, units, partners (beyond BP), places, assets.
- Each relay is wired by hand per module pair through environment variables; QA-046 (parties never relayed) was exactly
  this: the relay keys were set on the wrong service.

### 3.6 Overlapping masters

| Concept | Copies today | Risk |
|---|---|---|
| Locations | org units (control plane), places (Geospatial), spaces (CMMS), locations (Inventory) | Four hierarchies for the same site; reports cannot join them |
| Physical assets | CMMS `assets`, General ledger `fixed_assets` | Maintenance and depreciation never meet |
| Exchange rates | `public.currency_exchange_rates`, `public.tenant_exchange_rates`, `gigalibs_finance.consolidation_fx_rates`, `gigalibs_currency.currency_pairs` | Different rates per module |
| People | users/members (control plane), Workforce resources, person parties | Three identities for one employee |

### 3.7 Classic masters not present yet (iDempiere parity)

Payment terms (orders store a number of days), partner groups / customer and vendor categories, product tax categories
and tax codes on documents (Tax module contained), carriers and shipping methods, discount schemes, document types with
numbering series per document (a numbering engine exists in contracts: `packages/contracts/src/numbering`), customer
assets for service. Present: bank accounts, units and conversions, price lists, calendars and periods, chart of
accounts, party addresses and contacts, party merge (`survivorPartyId`).

### 3.8 Navigation, visibility and extension fields

- No master data area: masters sit across Operations, Finance and Settings; personas are coarse (6) and products and
  partners are listed for operations supervisors only.
- Extension columns exist with three names — `custom_extensions` (17 tables), `metadata` (8), `custom_fields` (4) — none
  shown on screens or governed; configured tenant fields are a separate mechanism (`custom-fields-nest`).

## 4. Architecture comparison (evidence-based)

| Dimension | iDempiere | Medusa v2 | GigaLibs | Notes |
|---|---|---|---|---|
| Runtime module isolation | Weak (one schema, cross-table FKs) | Good (module boundaries, one process, one DB) | **Strongest** (separate services, schema per module, RLS, per-module signed audience, gateway allow-lists, `audit:layers`) | The pasted "Medusa wins" is about developer ergonomics, not isolation |
| Cross-module relations | Direct FKs | `defineLink` + link tables + `query.graph` | Live lookups from the browser; replicas only for org/parties | GigaLibs lacks a declared reference layer |
| Developer ergonomics | Poor (dictionary in a running app) | **Best** (`model.define` + `MedusaService` = typed CRUD, generated migrations) | Heavy: one field in migration, domain SQL, record SQL, contracts, adapter, windows (6 hand-written places, 3 naming styles); 6.3k lines of adapters, 1.5k record SQL, 3.6k dictionary code, kept consistent by S16 audits | Biggest gap |
| Tenant security | Logical (`AD_Client_ID`) | Context-based | **Best** (RLS, Ed25519 contexts, org scopes, revocation, maker-checker) | Keep |
| Metadata-driven UI | Total but unsafe | None (hand-built admin pages) | **Best balance** (code-authored baselines + runtime-published, governed activations; safe evaluator; `MetadataWindow`) | Designer UX is specialist-grade |
| Workflows across modules | Document processes | Workflow SDK with steps and compensation | Kernel jobs, outbox/inbox relays, document-action coordinator; Workflow Studio not running | Missing a composable step/compensation SDK |
| Business depth | **Deepest** | Commerce only | Broad and growing (GL, costing, inventory, P2P, O2C, CMMS, workforce, safety, SPEED) | Masters and posting rules are the gap |

What the Medusa project shows in practice: modules are 1 model file + a 10-line `MedusaService` class; admin screens
are hand-written pages from one component kit (Table ×750, Container, Heading, Drawer); links are not used even there.
Medusa's simplicity is **conventions + generated CRUD + one UI kit**, not a metadata engine.

## 5. What to borrow, what to keep

| Borrow (adapted) | Why | Keep from GigaLibs |
|---|---|---|
| Model-first entity definition (`model.define`) | One declaration instead of six | Separate schema per module, RLS policies, tenant-scoped keys |
| Service factory (`MedusaService`) | Typed CRUD, filters, pagination without hand SQL | Record dispatcher rules (field policy, permissions, defaults, idempotency, versions, audit) |
| Links + query | Declared cross-module references | No cross-module FKs; signed contexts; replicas instead of shared tables |
| Workflow steps with compensation | Safe multi-module operations | Durable kernel jobs, outbox/inbox, idempotency |
| One admin UI kit and conventions | Simple screens | Metadata-driven windows and governed activation |

Do **not** adopt Medusa wholesale: it would lose row-level security, signed per-module contexts, organization scopes and
the governed application dictionary — the parts GigaLibs is ahead on.

## 6. Target architecture

### 6.1 Master Data Foundation

| # | Capability | Design | Builds on |
|---|---|---|---|
| M1 | **Master data hub** | `spec.masters` in each `module.yaml` (entity, window, label, importable, starter pack, reference set) → generated registry → one "Master data" area listing every master the person can read, with counts, empty/health state, import/export and links | Manifests, `modules:catalog`, navigation |
| M2 | **Platform reference data in use** | Load the sets once per platform; currency, country, language, time zone and unit pickers read them; no per-tenant copies, except platform units, which are written per workspace as read-only rows with deterministic ids because Products references units by `(tenant_id, id)` foreign keys (ADR-0038 §1); a workspace profile stores the country, currency, language and time zone chosen at creation | Existing reference store and builder |
| M3 | **Governed master data packs** | A `masters` layer in packs (units, categories, chart templates, tax codes, payment terms, absence types, classifications) applied by the kernel pack-apply job when a module is enabled or on demand; idempotent, versioned, audited; country and industry variants; replaces UI-hard-coded starter sets | Packs, kernel jobs |
| M4 | **Universal import/export kit** | Generalize the CMMS engine into the module SDK: XLSX/CSV streaming, aliases, preview, commit as a job, error file; rows validated **through the window dictionary and the record dispatcher** (same rules as the form, no bypass); references resolved by code via lookups; standard external-id mapping | CMMS import-export, record dispatcher |
| M5 | **Cross-module references** | Declare references in manifests (`field → owner entity`, `onArchive`); owners publish entity events (`<entity>.created/updated/archived.v1`); consumers keep thin reference replicas (id, code, name, status, version); the dispatcher validates referenced ids exist and are active; archive blocks new use | Org replica and party relay patterns, outbox/inbox |
| M6 | **Overlap reconciliation** | One canonical owner per concept (decisions in §9): places as the location master with CMMS spaces and Inventory locations linked to a place; CMMS asset ↔ fixed asset link; one FX rate owner; party as the person master with user and Workforce links | ADR |
| M7 | **Missing classic masters** | Payment terms, partner groups, tax categories and codes, carriers and shipping methods, discount schemes, document types with numbering series — built with M8's model layer | iDempiere parity list (§3.7) |
| M8 | **Data quality and lifecycle** | Consistent ACTIVE/ARCHIVED, duplicate detection and merge (parties already merge), optional approval for sensitive masters (bank details, credit limits), audit (exists) | Party merge, maker-checker |

### 6.2 Platform Kit (developer ergonomics without losing safety)

| # | Capability | Design |
|---|---|---|
| P1 | **Model-first entities** | `defineEntity('inventory.warehouses', { code: text().required().unique(), name: text(), type: valueList(...), orgUnit: reference('organization-units').required(), … })` in the module SDK → generated migration (diff), Zod contract, record adapter field policies, window field baselines (labels, help, types), lookups. One declaration, one naming style. For master-data-style entities first; domain services keep hand-written business logic |
| P2 | **Service factory** | `moduleRecords({ entities })` gives list/get/create/update/archive on the shared SQL layer with tenant transactions, versions, idempotency, audit and outbox events — replacing hand-written CRUD adapters for masters |
| P3 | **Reference layer** | `reference()` fields generate the replica consumer, the validator and the picker (M5) |
| P4 | **Generated relay wiring** | Relay targets and keys derived from manifests into compose and the deployment profile, so a relay cannot be configured on the wrong service again (QA-046) |
| P5 | **Workflow steps** | A small step/compensation API on top of durable kernel jobs for cross-module operations (quote → order → reservation; PO → receipt → bill), aligned with the document-action coordinator |
| P6 | **Audits stay** | Generated code must pass `audit:layers`, S16 windows and conversions, the deployment profile and migration pins; the audits then verify the generator instead of hand copies |

### 6.3 Simple metadata UI (low priority — analysis)

- **Today:** Configuration Studio is a five-step specialist workflow (Design → Review → Publish & activate → Runtime
  preview → Package) in about 5,300 lines of components; the dictionary workbench even carries a hard-coded sample.
- **Target, Medusa-simple, three screens:**
  1. **Data model** — the entities of each module with record counts (a settings list).
  2. **Entity** — one table of fields (label, type, required, help, shown) with inline edit and an "Add field" drawer
     offering eight plain types (text, number, money, date, yes/no, choice, link to a master, long text); drag to order.
  3. **Preview and publish** — a live form preview and one "Submit for review" button; review, publish and activate
     collapse into a status pill with a history drawer (maker-checker kept).
- **Per-record "Additional details"** (Medusa's metadata panel): tenant fields declared in the simple designer, stored in
  one SDK-standard extension column (unifying `custom_extensions`, `metadata`, `custom_fields`), shown as a section on
  every record and included in import/export.
- **Guardrails:** tenants add fields, labels, help, visibility, order and defaults; they never change canonical fields,
  permissions or posting rules — so customization cannot break modules.
- **Depends on** P1 (the model is the source of field facts) and M4 (imports include extension fields).

## 7. Roadmap — before new modules

| Phase | Scope | Done when |
|---|---|---|
| 0 — Decide and switch on (1–2 weeks) | ADRs (§9); load reference sets; currency/country/language/time zone pickers; master data hub (read-only registry); publish product events; generated relay wiring (P4) | Hub lists every master with counts; pickers use reference data; product events visible in the outbox |
| 1 — Masters usable on day one (3–5 weeks) | M3 packs (units, categories, chart templates by country, absence types, classifications, tax codes, payment terms); M4 import kit for partners, warehouses and items, chart of accounts, people, units, price lists; M5 replicas and validation for products, units and partners in Inventory, Orders, Procurement, General ledger, Manufacturing | A new workspace is usable in ten minutes from packs or a spreadsheet; an archived product cannot be used on a new document |
| 2 — Model layer (4–6 weeks) | P1–P3 in the module SDK; migrate simple masters (units, categories, classifications, absence types); build payment terms, partner groups, carriers, discount schemes, document types with P1; M6 reconciliation (places, assets, FX, people) | A new master is one declaration plus business rules; S16 audits pass on generated code |
| 3 — Experience (later) | Simple metadata UI and "Additional details"; workflow steps (P5) for create-from flows | A tenant admin adds a field in under a minute, reviewed and live without a deploy |

## 8. Safeguards ("without compromising the system")

- Additive only: new tables, columns, events and endpoints; no change to existing record contracts without a conversion.
- Module isolation unchanged: no cross-module foreign keys; replicas are fed by signed relays with idempotent inboxes.
- Security unchanged: RLS on every new table, signed per-module contexts, permissions in the permission catalogue,
  gateway allow-lists; reference data is read-only to tenants.
- Governance: packs and model changes are versioned and audited; tenant metadata stays maker-checker.
- Proof: each phase proven on the isolated test stack and the PostgreSQL proof harnesses before UAT; UAT backups taken
  from the live container (the release `backup.sh` targets the wrong container — see the memory note).
- Backfill: replicas start with a backfill job from the owner module, then events; validation is switched on per module
  after its replica is complete.

## 9. Decisions for the owner

**Decided 2026-11-03:** the owner accepted the recommendation on all five (1 and 5 → ADR-0037, 2 → ADR-0040,
3 → ADR-0039, 4 → ADR-0038 with the country order India, Japan, USA, Middle East, Europe, China, Russia, Africa and a
baseline for every other country).

1. **Canonical owners for overlapping masters:** places vs org units vs CMMS spaces vs Inventory locations; CMMS asset vs
   fixed asset; one FX owner; party as the person master.
2. **Model-first layer:** build `defineEntity` + service factory in the module SDK (recommended) vs keep hand-written
   adapters.
3. **Reference integrity policy:** replicas with validation (recommended) vs live validation calls.
4. **Pack scope:** which masters each country and industry pack carries first (proposal: units, categories, chart
   template, tax codes, payment terms; absence types and classifications for Workforce and CMMS).
5. **Where the master data hub lives:** its own area in the sidebar for administrators (recommended) vs under Settings.

## 10. Work items

Rows in `.pi/WORK_ITEMS.md`, cards in `.pi/tasks/`, order and dependencies in the execution plan §6.

| Card | Scope |
|---|---|
| WI-OI-152 | Master data hub and `spec.masters` registry (M1) |
| WI-OI-153 | Platform reference data loaded and consumed (M2) |
| WI-OI-154 | Governed master data packs (M3) |
| WI-OI-155 | Universal import/export kit (M4) |
| WI-OI-156 | Cross-module references: entity events, replicas, validation (M5, P3) |
| WI-OI-157 | Overlapping masters reconciliation (M6, ADR) |
| WI-OI-158 | Classic masters: payment terms, partner groups, tax codes, carriers, discounts, document types (M7) |
| WI-OI-159 | Model-first entities and service factory in the module SDK (P1, P2, ADR) |
| WI-OI-160 | Relay wiring generated from manifests (P4) |
| WI-OI-161 | Workflow steps with compensation (P5) |
| WI-OI-162 | Simple metadata UI and "Additional details" (§6.3, low priority) |
