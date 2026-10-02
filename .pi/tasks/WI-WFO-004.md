# WI-WFO-004: Universal Demand Forecasting & Shift Self-Service

- **Status:** Review
- **Work item:** WI-WFO-004 (Demand Forecasting & Shift Self-Service). Evidence goes in `.pi/work/WI-WFO-004.md`.
- **Size:** M

## Goal

Deliver universal demand forecasting, open shift marketplace, and self-service shift swaps: historical and connector-driven labour demand estimation with gap analytics, open shifts discovery and claim for frontline workers, and peer-to-peer shift swap requests with manager four-eyes approvals and atomic double-booking prevention.

## Scope

- **May change:**
  - `modules/gigaops/db/runtime-foundation/000024_wfo_forecasting.up.sql` (and `.down.sql`)
  - `modules/gigaops/apps/api/src/forecasting/*` (demand forecast calculation, gaps, utilisation)
  - `modules/gigaops/apps/api/src/shifts/*` (open shifts pickup, swap request & approval lifecycle)
  - `packages/contracts/src/workforce/universal.ts` (demand forecast and shift swap DTOs)
  - `apps/workflow-platform/components/gigaops/*` (ForecastDashboard, OpenShiftsBoard, ShiftSwapModal)
  - `.pi/work/WI-WFO-004.md`, `config/sdlc-governance.json`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Live production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `WI_WFO_DELIVERY_MANIFEST.md` §WI-WFO-004
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md` §E-04, §E-05
- `modules/gigaops/apps/api/src/gigaops.module.ts`

## Steps

1. **Governance & Pre-flight:**
   - Record `WI-WFO-004` in `.pi/WORK_ITEMS.md`, update `config/sdlc-governance.json`, `.pi/NOW.md`, and initialize `.pi/work/WI-WFO-004.md`.
2. **Database Migrations:**
   - Author migration `000024_wfo_forecasting.up.sql` (`wfo_demand_forecast`, `wfo_shift_swap_requests`) with tenant RLS, check constraints (`from_worker_id <> to_worker_id`), and reversible `.down.sql`.
3. **Contracts & API Layer:**
   - Add Zod contracts & DTOs for demand forecast queries, shift pickup, and swap lifecycle in `@gigalibs/contracts`.
   - Implement `WfoForecastingService` and `WfoForecastingController` (demand forecasting, position gap computation, capacity utilisation).
   - Implement `WfoShiftsService` and `WfoShiftsController` (open shifts discovery, worker shift claim, shift swap request, manager approval with atomic booking transfer).
4. **UI Workbench Integration:**
   - Implement `WfoForecastDashboard.tsx` (demand vs filled positions, capacity gap radar, 30/60/90 horizon).
   - Implement `WfoShiftMarketplace.tsx` (open shifts board, claim shift action, peer shift swap modal, swap approval queue).
   - Mount under GigaOps Workbench.
5. **Verification & Audit:**
   - Add comprehensive unit tests in `gigaops-api` for forecast calculation, shift claiming, and swap conflict prevention.
   - Run `pnpm verify` (must pass cleanly with known drift only).

## Done when

- [x] Migration `000024_wfo_forecasting.up.sql` and `.down.sql` authored with forced RLS and foreign key guards.
- [x] Demand forecast calculation and gap analysis operational.
- [x] Open shift marketplace and worker shift pickup functional.
- [x] Shift swap workflow (request, manager four-eyes approval, atomic booking swap) active.
- [x] `pnpm verify` passes cleanly across all packages and SDLC audits.
- [x] Evidence recorded in `.pi/work/WI-WFO-004.md`.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service or live owner data without authorization.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
