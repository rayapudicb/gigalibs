# WI-WFO-001: Universal WorkforceOps Foundation (Registry, Engagements, Scoped Workbench)

- **Status:** In progress (owner approved 2026-10-02)
- **Work item:** WI-WFO-001 (Universal WorkforceOps Foundation). Evidence goes in `.pi/work/WI-WFO-001.md`.
- **Size:** L

## Goal

Deliver the foundational data layer, API surface, and scoped user experience for the industry-agnostic WorkforceOps platform: persist universal worker records with configurable compliance documents and engagements with position quotas, bounded by the WI-OI-109 dynamic organization hierarchy.

## Scope

- **May change:**
  - `modules/gigaops/db/runtime-foundation/000020_wfo_worker_registry.up.sql` (and down migration)
  - `modules/gigaops/db/runtime-foundation/000021_wfo_engagements.up.sql` (and down migration)
  - `modules/gigaops/apps/api/src/workers/*` (new controller, service, tests)
  - `modules/gigaops/apps/api/src/engagements/*` (new controller, service, tests)
  - `packages/contracts/src/workforce/*` (universal DTOs and contracts)
  - `apps/workflow-platform/components/gigaops/*` (Worker Directory, Compliance, Engagement Calendar, and updated sections)
  - `.pi/work/WI-WFO-001.md` and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Live production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `WI_WFO_DELIVERY_MANIFEST.md`
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md`
- `modules/gigaops/apps/api/src/gigaops.module.ts`

## Steps

1. **Governance & Pre-flight:**
   - Record `WI-WFO-001` in `.pi/WORK_ITEMS.md` and update `config/sdlc-governance.json` and `.pi/NOW.md`.
   - Create initial evidence file `.pi/work/WI-WFO-001.md`.
2. **Database Migrations (Isolated PostgreSQL Verification):**
   - Write `000020_wfo_worker_registry.up.sql` (`wfo_workers`, `wfo_compliance_documents`) with forced RLS and down script.
   - Write `000021_wfo_engagements.up.sql` (`wfo_engagements`, `wfo_engagement_positions`) with check constraints and down script.
   - Verify migrations on an isolated throwaway PostgreSQL instance (up $\rightarrow$ down $\rightarrow$ up, idempotency).
3. **Contracts & API Layer:**
   - Define contracts in `@gigalibs/contracts` for workers, compliance docs, engagements, and positions.
   - Implement `WfoWorkersController` and `WfoWorkersService` with org-scope guard.
   - Implement `WfoEngagementsController` and `WfoEngagementsService` with quota and hierarchy scoping.
   - Add unit and integration tests for all 21 endpoints.
4. **UI Workbench Integration:**
   - Update `GigaOpsWorkforceWorkbench.tsx` section navigation to wire the new domains.
   - Implement `WorkerDirectory.tsx`, `WorkerProfile.tsx`, `ComplianceDocUpload.tsx`, and `EngagementCalendar.tsx`.
   - Ensure dynamic org-hierarchy scope (`OrganizationScopeV2`) filters records across all views.
5. **Verification & Certification:**
   - Write and execute automated Playwright browser certification (`scripts/verify-wfo-foundation.mjs`).
   - Run `pnpm verify` (must pass with known drift only).
   - Record evidence in `.pi/work/WI-WFO-001.md` and update `.pi/NOW.md`.

## Done when

- [x] All 4 new tables (`wfo_workers`, `wfo_compliance_documents`, `wfo_engagements`, `wfo_engagement_positions`) with migrations and constraints written.
- [x] API endpoints implemented with contracts, validation, and unit tests passing.
- [x] UI workbench renders Worker Directory and Engagement Calendar in GigaOps workbench.
- [x] `pnpm verify` passes with zero failures across all packages and audits (only the known `WORKFORCE_API_URL` drift).
- [x] Evidence is recorded in `.pi/work/WI-WFO-001.md`, and `.pi/NOW.md` is updated.
- [ ] Automated Playwright browser certification executed on live container deployment.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service, live database without backup, or owner's live data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
