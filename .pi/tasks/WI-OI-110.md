# WI-OI-110: Metadata and Application Dictionary Foundation

- **Status:** Review (local implementation; in-process proof only; no independent review). Corrected by the WI-OI-119 audit (2026-10-05).
- **Work item:** WI-OI-110 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-110.md`.
- **Size:** XL
- **Depends on:** WI-OI-039 (Configuration Studio), WI-OI-109 (Organization Hierarchy & Scope), ADR-0002, ADR-0013, ADR-0016, ADR-0018

## Goal

Build one production-grade, metadata-driven Application Dictionary for GigaLibs by extending the existing WI-OI-039 Configuration Studio and ADR-0002 architecture (without creating a second metadata engine).

The foundation allows platform and tenant administrators, within explicit governance limits, to define and publish:
- registered entities;
- module-owned and tenant-extension fields;
- relationships and references;
- value lists and bounded validation AST;
- forms, details, lists, tabs, sections and views;
- navigation/menu contributions;
- registered commands/actions;
- labels, help text, messages and translations;
- device-specific web/tablet/mobile presentation metadata;
- tenant overlays over platform/module baselines.

The runtime compiles these definitions into immutable, checksummed manifests consumed by web and mobile clients, strictly enforcing that metadata never bypasses module invariants, RBAC, tenant isolation, organization scope, licensing, entitlements, or server-side validation.

## Scope

- **May change:**
  - `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
  - `packages/contracts/src/configuration/`
  - `packages/configuration-core/`
  - `packages/configuration-react/`
  - `packages/module-sdk/`
  - `packages/db/` (forward migration only if projection tables needed)
  - `apps/playground-api/src/` (Configuration Studio controllers/services/adapters)
  - `apps/workflow-platform/` (Configuration Studio web UI & runtime renderer)
  - `scripts/verify-application-dictionary.mjs`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-OI-110.md`
- **Must not change:**
  - Protected Workforce UI components (GigaOpsWorkforceWorkbench.tsx, WfoWorkerDirectory.tsx, WfoEngagementCalendar.tsx, BulkInviteModal.tsx, WfoPayrollAdminGrid.tsx, WfoForecastDashboard.tsx, WfoShiftMarketplace.tsx, WfoComplianceDashboard.tsx, WfoCommsCenter.tsx, WfoVendorDirectory.tsx, WfoPackLibrary.tsx, WfoReportsHub.tsx);
  - Active WI-EAM files;
  - WI-OI-103 uncommitted corrections;
  - Applied database migrations;
  - CMMS import/export baseline files;
  - Mobile repository;
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-01, FR-02, FR-04, FR-05, FR-08, FR-11, FR-12, FR-13, FR-14, FR-15, FR-17)
- `docs/SDLC_DEVELOPMENT_GUIDE.md`
- `docs/architecture/ADR-0002-governed-metadata-configuration.md`
- `docs/architecture/ADR-0013-core-modules-and-solutions.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- iDempiere reference architecture (`/Users/rayapudi/idem` — read only for conceptual reconciliation)

## Slices

- **AD-0: Reconciliation and contracts** — iDempiere reconciliation matrix + strict versioned Zod contracts in `@gigalibs/contracts`.
- **AD-1: Dictionary package compiler** — canonical ordering, SHA-256 checksumming, dependency graph validation, cycle detection, locked field protection in `packages/configuration-core`.
- **AD-2: Persistence and migration** — reuse `ConfigurationChangeSet`, `ConfigurationPublishedVersion`, `ConfigurationActivation`; extend definition schema for application dictionary.
- **AD-3: Server APIs and authorization** — versioned BFF & API endpoints in `apps/playground-api` with maker-checker, validation, diff/impact preview, and outbox publication.
- **AD-4: Module contribution and adapter contract** — extend `ModuleAdapterDescriptorV1`; implement Tenant Profile adopter without touching Workforce or EAM business code.
- **AD-5: Application Dictionary administration UI** — high-density workspace in `apps/workflow-platform` with drawers, preview, diff, dependency graph, accessibility.
- **AD-6: Runtime web/mobile manifest** — runtime renderer consuming compiled manifest for Tenant Profile with safe AST expression evaluation and ETag/checksum caching.
- **AD-7: Packaging and lifecycle** — promotion, tenant overlays, pinned last-good manifests, cache resynchronization.
- **AD-8: Production-readiness certification** — test suite, acceptance journey proof, automated audits, and `pnpm verify`.

## Done when

- [x] ADR-0019 is documented and established.
- [x] iDempiere reconciliation matrix is documented with explicit adopt/adapt/reject decisions.
- [x] Strict contracts exist for all dictionary constructs.
- [x] Deterministic compiler produces stable SHA-256 manifests with cycle and type change rejection.
- [x] Real Tenant Profile adopter executes full end-to-end acceptance journey.
- [x] Administration UI allows complete metadata authoring with preview and maker-checker approval.
- [x] Runtime renderer consumes manifest safely without raw eval or arbitrary SQL.
- [x] Full automated test suite passes across compiler, API, security, and UI.
- [x] `pnpm verify --audits` and workspace verification pass with zero regressions.
- [x] Evidence recorded in `.pi/work/WI-OI-110.md` and `.pi/NOW.md` updated.

## Stop and ask if

- an unresolved architecture or schema decision arises;
- live database or deployment mutation is required;
- any destructive action or commit is requested.

## Report

At most five short bullets: what changed, the evidence, what's next, and what the owner must decide.
