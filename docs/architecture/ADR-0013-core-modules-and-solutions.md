# ADR-0013: Industry-agnostic core, business modules and solutions

- Status: Proposed. The direction was approved by the owner on 2026-09-28 ("core first"). Independent acceptance
  is pending.
- Date: 2026-09-28
- Amended by: ADR-0016 (2026-09-29), which narrows "core" to the kernel and makes forms, rules, workflow,
  notifications, reports, analytics, places, integration and the AI gateway capability modules. Where this ADR
  and ADR-0016 differ on what core contains, ADR-0016 applies.
- Work item: WI-OI-080 (plan: `docs/plans/manufacturing-package-solution-plan.md` §3–4, C1)
- Reviewers required before acceptance: Solution Architecture (independent), Product, Backend/Data, Security &
  Privacy, QA/SDET
- Builds on: ADR-0001 (one authoritative owner per business concept), ADR-0002 (configuration-first, guarded
  extension), ADR-0007 (module events through outbox relays), and `docs/GIGALIBS_PRODUCT_VISION.md` §2–3

## Context

GigaLibs sells a shared core plus the business modules each client chooses.
- Manufacturing is the first solution (WI-OI-079).
- Another industry (for example event crewing) must be able to take the core without the manufacturing modules.
- A developer must be able to build a new module without editing the core.

Measured on 2026-09-28:

**Package imports are already mostly clean.**
- 1,586 source files in 113 workspace units were scanned.
- Only 4 test files in core packages reference module-owned manifests.
- The 8 module-owned packages are imported only by themselves and by the excluded `apps/playground-web`.

**The coupling is elsewhere:**
- **Business data in the core database.** 31 of the 116 control-plane Prisma models belong to modules:
  procurement, commerce, support, knowledge base, e-signature, OCR, tax, currency, spend, and the finance ledger.
- **Module code inside the web shell.** Each module's screens, gateway routes, navigation and API clients are
  hand-written in `apps/workflow-platform`. 15 shared shell files reference CMMS.
- **Copied module plumbing.** Relay, outbox, retention, tenant session and schema-version code exists twice, in
  CMMS and in Workforce.
- **Three module descriptions:**
  - `module.yaml` (read by nothing);
  - `packages/module-registry`;
  - the hand-written `platformModuleCatalog`.
- **Duplicated foundations:** forms ×3, rules ×3, workflow ×4.

## Decision

### 1. Three layers

Dependencies point one way: solution → modules → core.

| Layer | Contains | Rule |
| --- | --- | --- |
| **Core** | Foundations every client gets, with no industry logic: <ul><li>identity and access</li><li>tenancy and entitlements</li><li>audit and evidence</li><li>metadata (fields, catalogues, forms, wording)</li><li>rules and workflow</li><li>events</li><li>places and parties</li><li>files, notifications, search</li><li>analytics facts</li><li>integration runtime, AI gateway</li><li>web and mobile shell</li><li>module registry and SDK</li><li>platform billing</li></ul> | Never imports a module; never stores a module's business data |
| **Business module** | One business capability with its own schema, least-privilege role, contracts, and web/mobile extension packages. Per the owner's 2026-09-28 decision and the product vision §8, a module runs in the shared module host by default; it receives a separate service only when scale, data isolation, team ownership, or failure isolation justifies extraction | Never imports another module's code or reads another module's schema. Uses contracts, APIs and events |
| **Solution** | Configuration only (industry pack, country pack, module selection). A new behaviour or object becomes a module | Never contains code |

`apps/workflow-platform` and `apps/module-host` are **shells**, the composition roots. The web shell composes
manifest-driven UI and gateway extension points; the module host composes modules that declare
`spec.runtime.hosting: host`. Nothing imports either shell. A module with `spec.runtime.hosting: service` follows
the same contracts and is the extraction path when a separate process is justified.

### 2. One owner per concept

These choices are recorded now and re-confirmed at acceptance.

| Concept | Owner |
| --- | --- |
| People, users, roles | Core identity. Workers are Workforce resources (ADR-0003) |
| Organisations and contacts (vendors, contractors, customers) | Core parties |
| Places | Core, by promoting Geospatial |
| Assets | Maintenance (CMMS) module, behind a separate `assets.v1` contract so a later split is possible |
| Parts and stock | Inventory module, extracted from CMMS when it is built (WI-OI-091) |
| Requisitions, purchase orders, receiving, vendors | Procurement & Vendors module. The 9 procurement models leave the core database (WI-OI-092) |
| Forms and checklists | Core metadata. The only engine is the WI-OI-039 governed configuration and forms core (`configuration-core`, Configuration Studio, ADR-0002 lifecycle). `form-engine-core` and `forms-engine` receive no new adopters. The other stream's `FormSchema` dual-mode forms are adopted only after review against it (decision D2) |
| Rules | Core rules evaluator: `@gigalibs/rule-engine-universal` (promoted by WI-OI-054). The Universal Rule Pro service is frozen |
| Workflow | **Not chosen yet.** No candidate runs in the certified runtime: `apps/workflow-api` (ADR-0001's execution plane) is a Python service outside Compose; Workflow Studio and Saga run outside it too. Until an ADR chooses one against the criteria below, no module attaches to any workflow engine, and approvals stay in reviewed module code. Criteria: durable execution certified on the reference runtime, signed context, tenant isolation, audit through the outbox, allowlisted actions only (ADR-0002) |
| Sensor readings | Core analytics time series. Condition Monitoring owns sensors, thresholds and alarms |
| Money | No general ledger (roadmap decision). The 4 finance-ledger models stay frozen; `LedgerGenesisRecord` waits for ADR-0012 |

### 3. Extension points

A module extends the core only through its manifest:
- navigation, routes, admin pages;
- slots on other modules' pages;
- mobile screens;
- permissions, catalogues and fields;
- events produced and consumed;
- AI actions;
- health checks.

`module.yaml` v1 becomes the single manifest (WI-OI-081). There are no in-process hooks that change core
behaviour and no runtime microfrontends. A manifest UI entry may point to a remote UI later.

### 4. Enforcement

`pnpm audit:layers` (`scripts/verify-layer-boundaries.mjs`, configured in `config/package-layers.json`) fails when:
- a workspace unit has no layer;
- core imports module code;
- a module imports another module;
- anything imports the shell or tooling;
- a core-database model is unclassified.

The 40 existing violations are in `config/layer-boundary-baseline.json`:
- 10 `MODULE_SCHEMA_ACCESS`;
- 17 from the ADR-0016 kernel/capability split (WI-OI-102c), all in legacy certification tests that read
  other packages' manifest files;
- 13 `FENCED_MODEL_WRITE`: existing writes to module-owned core tables (WI-OI-102d).
 Entries may only be removed. The audit also reports the shells' imports
of module code, which is the WI-OI-083/WI-OI-085 composition measure.

## Consequences

- Solution builds (WI-OI-081) can leave modules out, because core never depends on them.
- New business tables cannot enter the core database unreviewed.
- Moving the 9 procurement models needs forward-only migrations (copy, verify, switch, retire) in WI-OI-092. The
  other 22 module-owned models stay frozen and are excluded from solution builds.
- The workflow owner stays open. Approval hooks (WI-OI-078) wait for that decision.

## Alternatives rejected

- **In-process plugins that patch core behaviour** (WordPress hooks, Magento overrides). They break upgrades and
  weaken tenant isolation and audit.
- **Runtime microfrontends now.** They add version skew and bundle weight for one team building first-party
  modules.
- **A generic record store instead of module-owned schemas.** Rejected by ADR-0002.
- **Leaving business tables in the core database.** Every client would receive every business schema.
