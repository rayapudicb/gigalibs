# WI-OI-102: Foundation boundaries (kernel, capability modules, one engine per job, inventory)

- **Status:** In Progress. The owner started it on 2026-09-29 after approving ADR-0016 F1–F17.
- **Owner:** SDLC Orchestrator / Solution Architecture / Developer Platform.
- **Decision record:** `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`, which amends
  ADR-0013 §1.
- **Independent reviewers:** Product, Backend/Data, QA/SDET.

## G0: why

The shared core must be small, stable and certifiable (vision §3.1, §6). Every later module and industry depends
on it. Today:
- "core" includes capability products;
- engines are duplicated (3 forms, 3 rules, 4 workflow);
- business logic and tables sit in the core;
- 14 modules are code only;
- the catalogue claims AVAILABLE without certification;
- many packages are unused.

## G1: scope

**In scope:**
- ADR-0016 F1–F7, F9 and F12;
- catalogue truth, chosen by the owner on 2026-09-29.

**Out of scope:** the capabilities themselves (WI-OI-103 to WI-OI-107), and moving Procurement (WI-OI-092).

## G2: acceptance

1. ADR-0016 is recorded, and ADR-0013 points to it for the definition of core.
2. There is an evaluation of the forms, rules and workflow engines, and of the execution plane. Each has a
   recommendation, and the owner has chosen the workflow engine.
3. Every workspace unit and module is classified as kernel, capability, business, shell or tooling. The layer
   audit enforces the classification, and `platform-rbac` is part of the kernel.
4. The catalogue labels AP matching "hosted, moving". An audit fails on new code that writes to the 31 fenced
   core business tables.
5. Each of the 14 code-only modules has an owner-approved outcome: run in the host, freeze, or retire.
6. Every catalogue entry shows one of the vision's six maturity states, and nothing Uncertified claims to be
   available.
7. Each unused, excluded or misplaced package has an owner-approved outcome, carried out in batches with
   `pnpm verify` passing after each batch.
8. No running service changes behaviour, and no customer data is touched.

## G3: slices

Each slice has a task card in `.pi/tasks/` when it starts.

| Slice | What | Size | Status |
|---|---|---|---|
| 102a | ADR-0016, registration of WI-OI-102 to WI-OI-107, this file | S | Done, 2026-09-29 |
| 102b | Engine evaluation (F3, F12): forms, rules, workflow, execution plane | S | Done, 2026-09-29; owner decided |
| 102c | Kernel/capability/business classification in manifests and the layer audit (F1, F2); `platform-rbac` into the kernel | M | Done, 2026-09-29 |
| 102d | Fencing (F4, F5): the "hosted, moving" label and the fenced-table audit | S | Done, 2026-09-29 |
| 102e | Module triage and catalogue truth (F6): six maturity states in manifests, catalogue and screens | M | Done, 2026-09-29 |
| 102f | Package inventory (F7): proposal, then owner-approved batches | M | Done, 2026-09-29 |
| 102g | Merge `platform-rbac`'s department/group roles and Marketplace into the kernel, then retire the module (F6, owner decision 2026-09-29) | M | Proposed |

## 102a: ADR-0016 and registration (2026-09-29)

- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md` records F1–F17, their order and what is
  not decided.
- `.pi/WORK_ITEMS.md` registers WI-OI-102 (In Progress) and WI-OI-103 to WI-OI-107 (Proposed).
  `config/sdlc-governance.json` makes WI-OI-102 the only active item.
- **Verification:** `pnpm verify --audits`, with the known WORKFORCE_API_URL drift only.

## 102b: engine evaluation (2026-09-29)

**Method:**
- `rg` for importers across `apps/`, `packages/` and `modules/`, split into the running product (core API, web,
  the 5 running modules) and everything else;
- `pnpm-workspace.yaml` exclusions;
- test and line counts (source only);
- exact row counts in the local database.

Nothing was changed.

### Forms: ADR-0016 confirmed

| Implementation | Workspace | Used by the running product | Tests | Lines | Notes |
|---|---|---|---|---|---|
| `configuration-core` + `configuration-react` (Configuration Studio) | in | **yes** (core API and web, 4 + 4 files) | 20 | 2,493 + 1,078 | Governed designer, maker-checker, immutable publication (ADR-0002). **Keep.** |
| `form-engine-core` + `form-engine-react` | in / excluded | no | 1 | 453 + 842 | Imported only by the excluded `playground-web`, excluded packages, and a web tsconfig alias. Retire (102f). |
| `forms-engine`, `forms-engine-nest`, `forms-engine-react` | in / in / excluded | no | 0 | 88 + 725 + 328 | `forms-engine-nest` is imported by `accounts-receivable` (frozen). Retire once AR's triage (102e) moves or freezes that use. |

### Rules: ADR-0016 confirmed

| Implementation | Workspace | Runs | Tests | Lines | Data |
|---|---|---|---|---|---|
| `rule-engine-universal` (package) | in | no | 15 | 372 | Promoted out of quarantine and hardened in WI-OI-054. Used by the Rules module and by `playground-web`. |
| `universal-rule-pro` (`@gigalibs/rules-api`) | in | no, no upstream | 9 | 1,684 | `gigalibs_rules` schema: 0 rules, 0 evaluations. |

Only one engine was found: the Rules module wraps the package. ADR-0013's "rules ×3" was not reproduced in the
workspace; the other copies are in excluded code. **One Rules capability = `universal-rule-pro` on
`rule-engine-universal`.** It becomes a hosted capability module when a solution needs it.

### Workflow: owner decision needed (four candidates, none has ever run a workflow)

| Candidate | Where | Runs | Data | Tests | Lines | Fit with ADR-0016 |
|---|---|---|---|---|---|---|
| **A. Workflow Studio module** | `modules/workflow-studio` | no | `gigalibs_workflow`: 2 seeded definitions, 0 runs | 21 | 1,900 | Module pattern (own schema and role; Delta-5 seals and inbox, WI-OI-056 in Review). Fits the module host and F1. |
| B. Core API pipelines + Python execution plane | core API `workflows` controller (`WorkflowPipeline`/`Version`/`Run` in the **core** database, ReactFlow AST) + `apps/workflow-api` (FastAPI, Celery, its own Postgres and Redis in `docker/docker-compose.dev.yml`) | no (the execution plane is not in the local stack) | 17 pipelines, 17 versions, **0 runs** | 91 Python test files; 4 run in `pnpm test` | 2,784 Python | Workflow inside the core contradicts F1. A second language and runtime with its own database and Redis. |
| C. `workflow-engine`, `-sdk`, `-mcp` (+ excluded `-nest`, `-react`) | `packages/` | no | none | 0 | 188 + 166 + 190 (+ 84 + 9) | Imported only by `playground-web` and excluded packages. Retire (102f). |
| D. Saga orchestrator | `modules/saga-orchestrator` | no | none | 5 | 839 | A different job (compensation across modules). Cross-module events already use outbox relays (ADR-0007). Freeze (102e). |

**Recommendation:** A is the one workflow capability. It runs in the module host, uses the kernel job runner
(F14) for long-running steps, and takes over the visual pipeline designer from the core. B's 17 pipelines have
never run; they migrate or are dropped after a backup, as the owner decides. The Python execution plane leaves the
active product (excluded, kept in git) and is reconsidered as an AI/ML worker when the AI gateway (C11) is
designed. C retires, and D is frozen.

### Owner decisions (2026-09-29)

- **Workflow:** the **Workflow Studio module** is the one workflow capability. It runs in the module host, uses the
  kernel job runner (F14) for long steps, and takes over the visual pipeline designer from the core API.
  - The core `workflows` controller and the `workflow_pipelines`, `workflow_versions` and `workflow_runs` tables
    retire into it.
  - The workflow packages (C) retire in 102f. The saga orchestrator (D) is frozen in 102e.
- **Python execution plane** (`apps/workflow-api`): **parked.** It leaves the active product (excluded, kept in git)
  and is reconsidered as the AI/ML worker when the AI gateway is designed. Its 4 tests leave `pnpm test` in 102f.
- **The 17 core pipelines:** inspect first. They were inspected:
  - all 17 are verification test data from 2026-09-02 and 03 ("Operational verification …" and "BFF workflow …");
  - each is in its own `workflow-verification-*`, `bff-verification-*` or `control-plane-*` test tenant, with 1
    node and 0 runs.

  There is nothing to migrate. They go with the core workflow tables when those retire, after a backup.

## 102c: kernel, capability and business classification (2026-09-29)

### Classification (`config/package-layers.json`)

The 82 packages that were labelled `core` are now **50 kernel** and **32 capability** packages.

**Kernel (`core`):**

| Area | Packages |
|---|---|
| Identity and sessions | auth-core, auth-nest, auth-react, jwt-universal, oauth-universal, crypto, users-core |
| Tenancy | tenancy-nest, orgs-core, onboarding-flow |
| Roles and policy | rbac-core, rbac-nest, rbac-react |
| Versioned configuration and settings | configuration-core, platform-settings, platform-settings-nest, config |
| Module registry | module-registry, module-registry-nest, module-sdk, contracts |
| Persistence | db, db-migrations-runtime, pagination, cache, redis, storage-core, integrations/aws-s3, integrations/minio |
| Events and jobs | event-bus, queue, broker, realtime |
| Audit and retention | audit-core, audit-nest, archival-core, data-retention, privacy-gdpr |
| Observability | health, logger |
| API conventions | errors, validation-nest, i18n |
| Experience SDK and UI conventions | ui, ui-preset, icons, web-sdk, admin-kit, host-kit, embed-sdk |

**Capability (`capabilityPackages`):**

| Capability | Packages |
|---|---|
| forms | configuration-react, custom-fields, custom-fields-nest, form-engine-core, forms-engine-nest |
| rules | rule-engine-universal |
| workflow | approvals-core, approvals-nest, approvals-react, sla-engine, workflow-engine, workflow-sdk, workflow-mcp |
| notifications | notifications-core, notifications-react, email-templates, chat-core |
| analytics | analytics-core, charts-react, kpi-widgets-react, reports-core, reports-nest, reports-react |
| places | maps-core, maps-react, geofence-engine |
| ai | ai-chat-core, ai-chat-nest, integrations/openai |
| billing | billing-react, pricing-calculator |
| risk | fraud-detection |

**`retiring`** (removed in 102f): form-engine-core, forms-engine-nest, workflow-engine, workflow-sdk, workflow-mcp.
`packages/forms-engine` has no `package.json`, so it is not a workspace unit; it is removed in 102f too.

**Judgement calls, recorded for review:**
- `configuration-core` is **kernel**: it is the versioned, signed configuration engine that the core API runs
  (vision §3.1, "versioned configuration"). The forms designer built on it, `configuration-react`, is the forms
  capability.
- `host-kit`, `embed-sdk` and `admin-kit` are kernel as experience SDKs.
- `realtime` is kernel as event transport.

### Rules (`scripts/verify-layer-boundaries.mjs`)

New rules:
- `KERNEL_IMPORTS_CAPABILITY`;
- `CAPABILITY_IMPORTS_CAPABILITY`;
- `CAPABILITY_IMPORTS_MODULE`.

These stay as before: `CORE_IMPORTS_MODULE`, `MODULE_IMPORTS_MODULE`, `IMPORTS_SHELL`, `IMPORTS_TOOLING`,
`MODULE_SCHEMA_ACCESS`.

**Baseline:** rewritten to 27 named entries.
- 10 are schema accesses, unchanged.
- 17 come from the split. All of them are in three legacy certification tests that read other packages'
  `module.manifest.json`: `packages/chat-core/test/comms-certification.test.mjs`,
  `packages/form-engine-core/test/automation-certification.test.mjs` and
  `packages/module-registry/test/platform-certification.test.mjs`.
- The 4 former `CORE_IMPORTS_MODULE` entries are the same test lines, reclassified as `CAPABILITY_IMPORTS_MODULE`.
- No shipped source file violates the new rules.

**Proof:** temporary probe files made the audit fail with exit 1:
- `packages/logger` importing `@gigalibs/analytics-core` and `@gigalibs/rule-engine-universal` →
  `KERNEL_IMPORTS_CAPABILITY`;
- `packages/rule-engine-universal` importing `@gigalibs/maps-core` → `CAPABILITY_IMPORTS_CAPABILITY`.

The probes were removed, and the audit passes again.

### Manifests and generator

- `spec.category: capability | business` is required in module manifest v1 (`scripts/module-manifests.mjs`).
  - **capability (15):** analytics-studio, geospatial, universal-connector-hub, communications,
    document-scanner, esignature, ontology, workflow-studio, saga-orchestrator, universal-rule-pro,
    universal-data-studio, autonomous-recovery-studio, multi-currency, tax-configuration, platform-rbac (pending
    the owner's decision).
  - **business (4):** physical-operations-cmms, gigaops, accounts-receivable, spend-management.
- `pnpm module:new … --category business|capability`, default `business`. The template carries `__CATEGORY__`.
- **Proof:** a manifest with `category: industry` was refused ("spec.category must be capability or business").
  `module:new zz-probe … --category industry` was refused before writing anything. The positive generator path
  runs in the next generated-module proof.

### `platform-rbac`: stopped, owner question

`modules/platform-rbac` is not a copy of the kernel's `rbac-*`:
- It has its own API (`me`, departments, groups, roles, permissions, seats, users) over per-tenant schemas
  (659 lines in `rbac.service.ts`).
- Its only catalogue entry is **Module Marketplace** (`/marketplace`, AVAILABLE).
- The core database also has departments (the `Department` model, WI-OI-042).

Folding it into the kernel would duplicate the department hierarchy. The options are for the owner.

**Owner decision (2026-09-29): merge the useful parts.**
- Department/group roles merge into the kernel's existing departments and roles.
- The Marketplace becomes the kernel's page for enabling modules for a tenant.
- `platform-rbac` then retires. This is slice 102g.

Until then, its manifest keeps `category: capability` with a comment recording the decision.

## 102d: fencing (2026-09-29)

**AP label (F4):**
- The `invoice-matching` and `approval-queue` catalogue entries now say "Hosted by the core until the Procurement
  module exists (ADR-0016 F4)". `approval-queue` shows AP actions at `/actions`.
- Both carry `hostedFor: procurement`, and the catalogue was regenerated.
- The reason text is what the modules page and the tenant plan screen display.

**Reclassified:** `WorkflowPipeline`, `WorkflowVersion` and `WorkflowRun` are now module-owned ("workflow, moving to
Workflow Studio"). The core database counts are now 82 core models and 34 module-owned.

**Fence (F5):**
- `audit:layers` reports `FENCED_MODEL_WRITE` for any non-test, non-generated source that writes a module-owned
  core model:
  - Prisma `create`, `createMany`, `update`, `updateMany`, `upsert`, `delete` and `deleteMany` on the model's
    delegate;
  - raw `INSERT INTO`, `UPDATE` and `DELETE FROM` on its table.
- The generated Prisma client is excluded, because its doc comments show example writes.

**Existing writes, baselined (13):**
- `apps/playground-api/src/ap-action.service.ts` → SupplierInvoice
- `apps/playground-api/src/ap-ingestion.service.ts` → GoodsReceipt
- `apps/playground-api/src/ap-ingestion.service.ts` → GoodsReceiptLine
- `apps/playground-api/src/ap-ingestion.service.ts` → PurchaseOrder
- `apps/playground-api/src/ap-ingestion.service.ts` → Supplier
- `apps/playground-api/src/ap-ingestion.service.ts` → SupplierInvoice
- `apps/playground-api/src/ap-ingestion.service.ts` → SupplierInvoiceLine
- `apps/playground-api/src/ap-matching.service.ts` → ApMatchEvaluation
- `apps/playground-api/src/ap-matching.service.ts` → SupplierInvoice
- `apps/playground-api/src/workflow.service.ts` → WorkflowPipeline
- `apps/playground-api/src/workflow.service.ts` → WorkflowVersion
- `apps/workflow-platform/lib/cmms-ledger-settlement-service.ts` → JournalEntry
- `apps/workflow-platform/lib/cmms-ledger-settlement-service.ts` → JournalLineItem

**Finding:** `apps/workflow-platform/lib/cmms-ledger-settlement-service.ts` writes the **frozen** ledger tables
`JournalEntry` and `JournalLineItem`, but only its own test imports it; no route or screen reaches it. It is a
102f retirement candidate.

**Proof:** a probe in `apps/playground-api/src` with `prisma.supportTicket.create(…)` and a raw
`INSERT INTO "cart_sessions"` failed the audit (exit 1, `FENCED_MODEL_WRITE` for SupportTicket and CartSession).
With the probe removed, the audit passes.

**Baseline:** 40 named entries:
- 10 schema accesses;
- 17 from the kernel/capability split, all in legacy tests;
- 13 fenced writes.

## 102e: catalogue truth and module triage (2026-09-29)

### Mechanism

- **Contract:** `PlatformModuleMaturity` (the vision §5 states: CONCEPT, UI_PROTOTYPE, CORE_IMPLEMENTED,
  INTEGRATED_CANDIDATE, CERTIFIED, PRODUCTION_PROVEN) is a required `maturity` field on every catalogue entry.
- **Validator:** `readiness: AVAILABLE` requires maturity CERTIFIED or PRODUCTION_PROVEN. Nothing is certified, so
  **no entry is AVAILABLE** any more. The 9 former AVAILABLE entries became REVIEW, which leaves access unchanged,
  because REVIEW is still openable.
- **Screens:** a maturity badge (Medusa UI, `ui-*` tokens) on the modules page and the tenant plan screen
  (`components/modules/MaturityBadge.tsx`, `lib/module-maturity.ts`).
- **Generator:** new modules start at CORE_IMPLEMENTED, because they come with working code and tests.
- **Chart gallery:** its counts come from the charts the API returns; the hard-coded "(6)" and "All 36 Charts" are
  gone.
- **Test:** `apps/workflow-platform/__tests__/module-maturity.test.ts` checks that every entry has a known maturity
  and that none is advertised as available without certification.

### Maturity by evidence (32 entries)

| Maturity | Entries |
|---|---|
| INTEGRATED_CANDIDATE (13) | tenant-access, personal-security, exceptions-recovery, approval-queue, value-ledger, invoice-matching, dynamic-forms, platform-control, analytics-studio, geospatial-studio, gigaops, asset-maintenance, connections |
| CORE_IMPLEMENTED (14) | execution-runs, accounts-receivable, autonomous-recovery, document-scanner, esignature, multi-currency, operational-ontology, module-marketplace, saga-orchestrator, spend-management, tax-configuration, data-contracts, rule-studio, workflow-definitions |
| UI_PROTOTYPE (3) | reports (the read model returns 503), master-data (in-memory store), connector-hub (no OAuth or schema discovery yet) |
| CONCEPT (2) | solution-packs (an unavailable-capability page), communications-textfly (a separate project, not integrated) |
| CERTIFIED, PRODUCTION_PROVEN | none |

Total: 13 + 14 + 3 + 2 = 32. Each entry has exactly one maturity, taken from its manifest.

**Reasons rewritten to what exists:**
- Among the claims removed: e-signature "court-admissible … X.509", marketplace "double-entry billing", workflow
  "real-time execution telemetry", reports "statutory GAAP", connector "1-Click OAuth", ontology "sovereign digital
  twin", CMMS "IoT".
- Each entry now says whether it runs, what is missing, and "Not certified".

### Triage (F6): owner decisions, 2026-09-29

**Kept as capabilities:**
- Workflow Studio: runs in the host when workflow work starts.
- Rules (`universal-rule-pro`): hosted when a solution needs it.
- Communications: the future notifications capability; TextFly stays separate.

**Merged:** `platform-rbac` merges into the kernel (102g).

**Frozen and locked (10):** data-contracts, saga-orchestrator, accounts-receivable, spend-management,
tax-configuration, multi-currency, esignature, document-scanner, operational-ontology, autonomous-recovery.
- Their readiness is CONTAINED, so the sidebar and modules page show them locked, with their reasons.
- They are no longer in new-tenant trials; existing entitlements are kept.
- E-Signature's development-token path can no longer be reached from its screen.

The `module-access` test used Accounts Receivable as its platform-inspection example. It now checks the rule on an
openable copy, and asserts that the locked entry stays closed even to platform operators.

### Findings for later

- **In-memory business stores in the web app:** `lib/master-data-store.ts` (the Master Data workbench) and
  `lib/solution-packs-store.ts`. They break `AGENTS.md` ("no local-only business persistence"). Both entries are
  labelled honestly; they are reviewed in 102f.
- **Kept modules without running services:** workflow-definitions, rule-studio, communications-textfly and
  module-marketplace are still openable, but their services do not run. They were not locked, because the owner's
  lock decision covered frozen modules only.
- **Not deployed yet:** the running web on 5180 shows the old labels until its image is rebuilt.

**Verification:** `pnpm verify` passes (known drift only), including web type-check, contracts build, the
catalogue-truth test and the updated module-access test.

## 102f: package inventory and clean-up (2026-09-29)

**Owner decisions (2026-09-29):**
- Proceed with the recommended batches A–D; each ran separately, with `pnpm verify` after it.
- Lock the Master Data workbench.

**The lock now covers APIs** (`lib/module-access.ts`):
- `canUseTenantModule` refuses any CONTAINED or PLANNED catalogue entry, whatever the features and permissions.
- That function gates 28 web API routes and the generic gateway, so a locked module refuses its APIs as well as
  its screen. E-Signature's development-token route is therefore unreachable.
- Master Data is CONTAINED, with its in-memory reason, and out of trials.

| Batch | Removed | Notes |
|---|---|---|
| A (decided) | `workflow-engine`, `workflow-sdk`, `workflow-mcp`, `form-engine-core`, `packages/forms-engine`; the dead `lib/cmms-ledger-settlement-service.ts` and its test; the dead `lib/solution-packs-store.ts` | `db-migrations-runtime` was **restored**: it has no source, but the migrations image and the deployment-profile check use its `package.json`. It is kernel. |
| A (Python plane) | `pnpm test` no longer runs `test:execution-api` (the script remains for manual use) | `apps/workflow-api/PARKED.md` records the owner decision (ADR-0016 F12). |
| B (unused starter code) | 32 packages: ui, ui-preset, icons, admin-kit, auth-react, rbac-react, jwt-universal, oauth-universal, users-core, orgs-core, onboarding-flow, config, errors, health, pagination, archival-core, data-retention, approvals-core/-nest/-react, sla-engine, reports-core/-nest/-react, custom-fields, chat-core, billing-react, pricing-calculator, fraud-detection, ai-chat-core/-nest, integrations/openai. Also the legacy `module-registry` manifest test, which is not in `pnpm test`, read retired manifests, and is superseded by the WI-OI-081 manifest audit. | **Kept** after the reference scan: `embed-sdk` and `host-kit` (the separate TextFly project refers to them), and `custom-fields-nest` (the frozen AR module imports it). |
| C (quarantined) | 104 workspace-excluded packages; `apps/docs` and `apps/storybook` (stubs); the retired `apps/playground-web` | `pnpm-workspace.yaml` exclusions and `config/runtime-quarantine.json` keep only the 3 TextFly apps. The retired-app audit accepts a removed app (`scripts/verify-runtime-data-integrity.mjs`), and `verify-package-dependencies.mjs` no longer hard-codes playground-web. |
| D (frozen, no module) | `cart-react`, `orders-nest` (commerce), `ledger-nest` (a ledger is ruled out by ADR-0013), `knowledge-base-react` | They were removed from `modulePackages`. |

**Kept on purpose (16 + 4):**
- queue, event-bus, redis, cache (the scheduler, WI-OI-104);
- realtime (mobile);
- storage-core, integrations/aws-s3, integrations/minio (report files, WI-OI-106);
- maps-react, geofence-engine (places, WI-OI-105);
- kpi-widgets-react (WI-OI-103);
- notifications-core, notifications-react, email-templates (Communications);
- rule-engine-universal (Rules);
- forms-engine-nest and custom-fields-nest (the frozen AR imports them);
- embed-sdk and host-kit (TextFly);
- the AR, Spend and Multi-currency packages (frozen modules, left in place).

**Tests for locked modules:**
- 11 web suites that exercise the routes of locked modules use `describe.skipIf(isLockedModule(key))` (helper
  `__tests__/helpers/locked-modules.ts`). They run again automatically when a module is revived.
- `module-access.test.ts` proves that every locked entry is refused, even with its feature and `*`, and that an
  open module is not.

**Result:**
- 586 tracked files removed (about 43,000 lines).
- Workspace units: 77, down from 113 (kernel 34, capability 13, module 27, shell 2, tooling 1).
- Layer baseline: 20 entries, down from 40 (9 schema accesses, 11 fenced writes).
- Tests: 214 files and 1,930 tests pass; 11 files and 109 tests are skipped while their modules are locked.
- The Python execution-plane tests no longer run in `pnpm test`.
- `pnpm verify` passes, with the known drift only.
