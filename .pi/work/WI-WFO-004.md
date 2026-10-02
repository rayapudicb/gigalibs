# WI-WFO-004 evidence: Universal Demand Forecasting & Shift Self-Service

## Authority and state

- Owner approved `.pi/tasks/WI-WFO-004.md` on 2026-10-02 with "proceed" / "go".
- WI-WFO-004 is the sole active implementation item.
- Preserved: uncommitted corrections in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`.

## Plan of execution

1. **Step 1:** Governance and pre-flight reconciliation.
2. **Step 2:** Database migrations:
   - `000024_wfo_forecasting.up.sql` / `.down.sql` (`wfo_demand_forecast`, `wfo_shift_swap_requests`).
3. **Step 3:** Contracts & DTOs:
   - Demand forecasting schemas (forecast items, gap analysis, utilisation).
   - Shift marketplace schemas (open shifts, claim shift, swap request, swap response).
4. **Step 4:** API Backend (`modules/gigaops`):
   - `WfoForecastingService` & `WfoForecastingController`.
   - `WfoShiftsService` & `WfoShiftsController`.
5. **Step 5:** UI Workbench (`apps/workflow-platform`):
   - `WfoForecastDashboard.tsx`.
   - `WfoShiftMarketplace.tsx`.
   - Wire into `GigaOpsWorkforceWorkbench.tsx` section.
6. **Step 6:** Unit tests & `pnpm verify` (Complete).

## Delivery Evidence

### Migrations
- `modules/gigaops/db/runtime-foundation/000024_wfo_forecasting.up.sql`: Authored `wfo_demand_forecast` and `wfo_shift_swap_requests` with tenant RLS isolation (`gigaops_wfo_demand_forecast_isolation`, `gigaops_wfo_shift_swap_isolation`), foreign keys, and self-swap check constraint (`from_worker_id <> to_worker_id`).
- `modules/gigaops/db/runtime-foundation/000024_wfo_forecasting.down.sql`: Reversible migration.
- `modules/gigaops/apps/api/src/runtime-config.ts`: Runtime schema contract version incremented to `24`.

### Contracts & Schemas
- `packages/contracts/src/workforce/universal.ts`:
  - `WfoDemandForecastRecordV1`, `WfoForecastQueryV1`, `WfoPositionsGapV1`, `WfoUtilisationReportV1`.
  - `WfoOpenShiftV1`, `ClaimWfoShiftV1`, `CreateWfoShiftSwapV1`, `RespondWfoShiftSwapV1`, `WfoShiftSwapRecordV1`.

### API Implementation
- `modules/gigaops/apps/api/src/forecasting/wfo-forecasting.service.ts`: Persisted & projected demand forecasting, gap categorization (critical gap, moderate gap, optimal, overstaffed), capacity utilisation aggregation.
- `modules/gigaops/apps/api/src/forecasting/wfo-forecasting.controller.ts`: Endpoints for `/api/v1/wfo/planning/forecast`, `/gaps`, `/utilisation`, `/recalculate`.
- `modules/gigaops/apps/api/src/shifts/wfo-shifts.service.ts`: Open shifts discovery, worker shift claim with schedule conflict prevention, peer shift swap requests, four-eyes manager approvals with atomic booking assignment.
- `modules/gigaops/apps/api/src/shifts/wfo-shifts.controller.ts`: Endpoints for `/api/v1/wfo/shifts/open`, `/shifts/:id/pickup`, `/shift-swaps`, `/shift-swaps/:id/approve`.

### Tests
- `modules/gigaops/apps/api/src/shifts/wfo-shifts.spec.ts`: 4/4 passing unit tests verifying forecasting query validation, gap status computation, self-swap rejection, and four-eyes approval enforcement.
- All 22 test files (141 tests) in `@gigalibs/gigaops-api` passing.

### Workbench UI
- `apps/workflow-platform/components/gigaops/WfoForecastDashboard.tsx`: Demand forecasting dashboard with 30/60/90 day horizon selectors, recalculate action, KPI summary cards, and labour gap radar.
- `apps/workflow-platform/components/gigaops/WfoShiftMarketplace.tsx`: Dual-tab open shifts marketplace and peer shift swap approval queue with request modal and four-eyes approve/reject buttons.
- `apps/workflow-platform/components/gigaops/GigaOpsWorkforceWorkbench.tsx`: Integrated `SchedulingHub` multi-tab interface under `scheduling` vertical.
- Next.js production build (`@gigalibs/workflow-platform`) compiled with exit code 0.

### Audit & Verification Results
```text
$ node scripts/verify.mjs --audits
PASS  audit:production-data          1 s
PASS  audit:all-runtime-data         0 s
PASS  audit:package-dependencies     1 s
PASS  audit:api-boundary             0 s
PASS  audit:navigation               0 s
PASS  audit:sdlc                     0 s
PASS  audit:layers                   1 s
PASS  module manifests               0 s
KNOWN deployment profile             0 s
      only the known WORKFORCE_API_URL drift
RESULT: PASS (1 known drift)
```

