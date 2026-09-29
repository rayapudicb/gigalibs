# ADR-0016: Kernel, capability modules and the foundation decisions

- **Status:** Proposed. The owner approved decisions F1–F17 on 2026-09-29 ("approve F1–F17 … let's start the
  development"). Independent acceptance is pending.
- **Date:** 2026-09-29.
- **Work items:** WI-OI-102 (boundaries and inventory) and WI-OI-103 to WI-OI-107 (the capabilities below).
- **Amends:** ADR-0013 §1, which defined "core". Everything else in ADR-0013 stands.
- **Builds on:**
  - ADR-0001 (one owner per concept);
  - ADR-0002 (governed configuration);
  - ADR-0007 (events through outbox relays);
  - ADR-0013 (layers);
  - `docs/GIGALIBS_PRODUCT_VISION.md` §3, §5, §8, §9, §10.
- **Reviewers required before acceptance:** Solution Architecture (independent), Product, Backend/Data, Security &
  Privacy, QA/SDET.

## Context

The owner's business model is one shared core plus the modules each client chooses. Wave 0 made modules
generatable (WI-OI-085). A check of the repository against the vision on 2026-09-29 found the foundation itself
unsettled.

**Too much in "core":**
- ADR-0013 puts forms, rules, workflow, notifications, analytics facts, integration and the AI gateway in "core".
- The vision (§3.1) keeps the kernel small and treats those as capability products.

**Duplicated engines:**
- 3 forms engines;
- 3 rules engines;
- 4 workflow engines, one of them the Python execution plane.

**Partial separation:**
- 5 of 19 modules run as services. 14 are code only, and 9 catalogue entries claim AVAILABLE with no certification.
- AP matching still runs in the core API (hosted for Procurement).
- 31 business tables sit in the core database.
- 56 of the 82 core packages are used by nothing that runs, 104 packages are excluded from the workspace, and 8
  module packages live in `packages/`.

**Common capabilities are incomplete:**
- The Analytics query engine returns only totals.
- There are three connector implementations.
- There is no scheduler.
- Place scope reaches modules but is not enforced.
- Reports are CSV only.
- Industry packs live inside Workforce.

The evidence is in `.pi/handoff/HANDOFF-2026-09-29.md` §3.4–§3.5, `.pi/handoff/core-package-usage.tsv` and
`.pi/proposals/agriculture-package-plan.md` §11.

## Decision

### Boundaries (WI-OI-102)

| # | Decision | Consequence |
|---|---|---|
| F1 | **Core means the kernel only.** The kernel covers:<ul><li>identity and sessions;</li><li>tenants and entitlements;</li><li>roles, permissions and policy;</li><li>settings and the module registry and lifecycle;</li><li>persistence conventions and migrations;</li><li>events, jobs and idempotency;</li><li>audit, secret references, health and observability;</li><li>API conventions.</li></ul>Forms and custom fields, rules, workflow and approvals, notifications, documents, reports, analytics, places, integration, search and the AI gateway are **capability modules**. | Capability modules follow the module contract (vision §4) and are selected by solutions. They run in the module host unless F9 applies. The web and module host remain shells (ADR-0013). Where a concept's home is unclear (for example parties or master data), the WI-OI-102 inventory proposes one and the owner decides. |
| F2 | **Core stays a label enforced by `pnpm audit:layers`.** There is no mass move into a new folder. | Import paths stay stable. WI-OI-102 adds the kernel/capability/business distinction to manifests and to the layer audit. |
| F3 | **One engine per job.**<ul><li>**Forms:** the Configuration Studio engine (running, maker-checker) stays, and the other two retire.</li><li>**Rules:** the rules engines merge into one Rules capability module.</li><li>**Workflow:** the four implementations are evaluated and one is kept; the owner chooses after the evaluation.</li></ul> | Retired engines are removed through the package inventory (F7), never while something still depends on them. |
| F4 | **AP matching and actions stay hosted by the core API until Procurement becomes a module** (WI-OI-092, Wave 2). | The catalogue labels them "hosted, moving". No new AP behaviour is added to the core. |
| F5 | **The 31 business tables in the core database are fenced.** | An audit fails on any new code that writes to them. A table is dropped or moved only through the inventory, after a verified backup and the owner's OK. |
| F6 | **The 14 code-only modules are triaged.** Each will run in the module host, be frozen, or be retired, and the catalogue shows its real maturity. `platform-rbac` folds into the kernel. | This goes with catalogue truth (vision §5): six maturity states, and nothing advertised as available unless Certified. |
| F7 | **Package inventory.** Each of the 56 unused core packages, the 104 excluded packages and the 8 module packages in `packages/` is finished, merged into what works, moved into its module, or deleted (git keeps history). | The owner approves each batch before files are deleted or moved. |
| F9 | **Analytics and Connector Hub stay separate services.** | Heavy queries and outside network access justify isolation (vision §8). CMMS, Workforce and Geospatial stay services (owner decision of 2026-09-28). |
| F12 | **The Python execution plane** (`apps/workflow-api`) is decided inside F3's workflow evaluation. | Until then it stays out of the local stack. |

### Common capabilities (WI-OI-103 to WI-OI-107)

| # | Decision | Work item |
|---|---|---|
| F13 | **Complete the Analytics engine** as a foundation capability.<ul><li>A query contract with measures, several dimensions, time grain, filters and place scope.</li><li>Formula measures.</li><li>Typed facts and summaries.</li><li>Chart templates that hold no data, all 24 types switchable, and a map.</li><li>Dashboards with shared filters.</li></ul>Target: 95% of dashboard queries under 1 s at 10M rows. First proof on manufacturing data. | WI-OI-103 |
| F16 | **Builder permissions.**<ul><li>Seven permissions (read, connectors, mappings, models, charts, dashboards, reports, export).</li><li>Four default roles: Viewer, Analyst, Data steward, Tenant admin.</li><li>Measure changes are published by a second person.</li><li>Scheduled reports run with their owner's rights, and go only to recipients allowed to see the data.</li></ul> | WI-OI-103 |
| F11 | **Analytics owns reports.** The core's switched-off Reports entry is removed. | WI-OI-103 |
| F8 | **Connector Hub is the only integration path.**<ul><li>An adapter framework: logins, paging, incremental pulls, retries, quarantine.</li><li>Pulled data reaches Analytics through no-code field mapping.</li><li>The connector code in Analytics and the core API retires.</li></ul> | WI-OI-104 |
| F14 | **One scheduler and job runner in the kernel** for data pulls, report schedules and retries. | WI-OI-104 |
| F15 | **Places with boundaries.**<ul><li>Area, and containment of points, computed in code; PostGIS only if later needs justify it, with its own ADR and a restore drill.</li><li>Records are tagged with their place when they arrive; unmatched records go to a visible "Unplaced" bucket.</li><li>Every module query honours the user's place scope.</li></ul> | WI-OI-105 |
| F17 | **Reports v2:** PDF (charts rendered on the server) and Excel (formula-injection safe), right after the Analytics engine. | WI-OI-106 |
| F10 | **Industry packs move to the solution layer**, one pack covering every module, using the seven layers of WI-OI-074. | WI-OI-107 |

### Order

1. WI-OI-102: the ADR first, then:
   - the engine evaluation (F3, F12);
   - the kernel/capability classification (F1, F2);
   - fencing (F4, F5);
   - module triage with catalogue truth (F6);
   - the package inventory (F7).
2. WI-OI-103: Analytics engine, permissions and reports ownership.
3. WI-OI-104: integration foundation and the scheduler.
4. WI-OI-105: places.
5. WI-OI-106: Reports v2.
6. WI-OI-107: industry packs.

One item is active at a time (`config/sdlc-governance.json`). The agriculture package
(`.pi/proposals/agriculture-package-plan.md`) then needs only its sources and its pack.

## Not decided here

- **Which workflow engine is kept, and the fate of the execution plane:** after the WI-OI-102 evaluation.
- **Per-module (F6) and per-package (F7) outcomes:** proposed in WI-OI-102, approved by the owner in batches.
- **App-store presence of the field app:** before Release 1. Mobile offline storage is decided (SQLite on the
  device, with commands the server validates) and is recorded in ADR-0014 when WI-OI-084 starts.

## Consequences

- **The kernel gets smaller and easier to certify.** Capabilities are certified one by one (vision §6) instead
  of as one large core.
- **Solutions choose capabilities.** A solution file lists capability modules as well as business modules.
- **Short-term deletion work**, the retired engines and packages, in owner-approved batches.
- **No production claim.** Everything here is local evidence until independent review, UAT and human release
  authority.
