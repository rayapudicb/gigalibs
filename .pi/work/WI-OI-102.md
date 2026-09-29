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
| 102d | Fencing (F4, F5): the "hosted, moving" label and the fenced-table audit | S | Proposed |
| 102e | Module triage and catalogue truth (F6): six maturity states in manifests, catalogue and screens | M | Proposed |
| 102f | Package inventory (F7): proposal, then owner-approved batches | M | Proposed |
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
