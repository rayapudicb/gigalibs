# WI-OI-111: Core Parties and Bounded Custom Applications (Phase 3 Reference Adoption)

- **Status:** Review (committed `ad7f83b`; not independently reviewed). Corrected by the WI-OI-119 audit (2026-10-05).
- **Work item:** WI-OI-111 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-111.md`.
- **Size:** XL
- **Depends on:** WI-OI-109 (Organization Hierarchy & Scope), WI-OI-110 (Application Dictionary Foundation), ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019

## Goal

Implement Enterprise Architecture Phase 3: prove that the Phase 2 Application Dictionary extends a canonical shared master (**Core Parties**) across multiple roles (Customer, Supplier, Contractor, Agency, Carrier, Partner) and empowers tenant administrators to operate bounded, non-core record applications (**Bounded Custom Apps**) with zero runtime DDL and zero arbitrary code execution.

## Scope

- **May change:**
  - `docs/architecture/ADR-0020-core-parties-reference-adoption-and-bounded-custom-apps.md`
  - `packages/contracts/src/parties/` & `packages/contracts/src/configuration/`
  - `packages/db/` (forward migration for `Party*` models, composite tenant FKs, forced RLS)
  - `apps/playground-api/src/parties/` & `party-configuration.adapter.ts`
  - `apps/workflow-platform/app/(app)/parties/` & `apps/workflow-platform/components/parties/`
  - `packages/configuration-react/` (support Party and non-core custom record layouts)
  - `scripts/verify-core-parties-and-custom-apps.mjs`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-OI-111.md`
- **Must not change:**
  - Protected Workforce UI components (GigaOpsWorkforceWorkbench.tsx, WfoWorkerDirectory.tsx, WfoEngagementCalendar.tsx, BulkInviteModal.tsx, WfoPayrollAdminGrid.tsx, WfoForecastDashboard.tsx, WfoShiftMarketplace.tsx, WfoComplianceDashboard.tsx, WfoCommsCenter.tsx, WfoVendorDirectory.tsx, WfoPackLibrary.tsx, WfoReportsHub.tsx);
  - Active WI-EAM files;
  - Existing frozen AR Customer, AP Supplier, and CMMS vendor tables (reference mapping only, no silent rewrites);
  - Applied migrations;
  - Secrets and `.env*` files;
  - The live application on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-3-reference-adoption-implementation-plan.md`
- `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
- `docs/architecture/ADR-0013-core-modules-and-solutions.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `docs/SDLC_DEVELOPMENT_GUIDE.md`

## Slices

- **P3-0: Architecture & Reconciliation** — Reconcile Party across AR/AP/CMMS/Workforce; publish ADR-0020 and threat model.
- **P3-1: Strict Contracts** — Zod schemas in `@gigalibs/contracts` for Party, roles, addresses, identifiers, contact points, relationships, org scoping, and events.
- **P3-2: Forward Persistence & RLS** — Prisma models in `packages/db` with forward migration, composite tenant FKs, and RLS policies.
- **P3-3: Domain Invariants & Outbox** — Party service with concurrency, idempotency, versioning, audit logging, and transactional outbox events (`party.created.v1`, `party.updated.v1`, etc.).
- **P3-4: APIs & Dictionary Adapter** — Core Party REST API in `playground-api`, generated client, and `PartyConfigurationAdapterV1` exposing locked core fields & tenant overlay envelope.
- **P3-5: Party Workspace UI** — Web/tablet Party workspace in `workflow-platform` with overview counters, search/filter table, create/edit drawer, dossier tabs, merge preview, and accessibility.
- **P3-6: Bounded Custom Records Hardening** — Harden existing `ConfigurationRecord`/`ConfigurationTemplate` APIs; declare `NON_CORE` entities with reserved-word protection.
- **P3-7: Lifecycle, Promotion & Recovery** — Packaging promotion, last-good pin, rollback/forward-fix journeys, and cache invalidation.
- **P3-8: Integrated Certification** — Multi-tenant/sibling-org verification script (`scripts/verify-core-parties-and-custom-apps.mjs`) and complete audit suite.

## Done when

- [x] ADR-0020 is documented establishing canonical Core Parties and bounded custom applications.
- [x] Strict Zod contracts exist for all Party records, roles, identifiers, addresses, and events.
- [x] Forward PostgreSQL migration applies cleanly with tenant isolation and RLS.
- [x] Party domain invariants enforce single canonical identity across multiple roles.
- [x] Core Parties is registered in the Application Dictionary via `PartyConfigurationAdapterV1`.
- [x] Tenant administrators can author and publish overlays for Party fields and layouts without DDL.
- [x] Bounded non-core custom applications operate securely with zero arbitrary code execution.
- [x] Complete Party workspace UI is accessible (WCAG 2.1 AA) with loading, empty, and error states.
- [x] Integration script `scripts/verify-core-parties-and-custom-apps.mjs` passes.
- [x] `pnpm verify --audits` and full test suite pass with zero regressions.
- [x] Evidence recorded in `.pi/work/WI-OI-111.md` and `.pi/NOW.md` updated.

## Stop and ask if

- an unresolved architecture or schema decision arises;
- live database or deployment mutation is required;
- any destructive action or commit is requested.

## Report

At most five short bullets: what changed, the evidence, what's next, and what the owner must decide.
