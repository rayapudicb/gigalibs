# WI-OI-103: Analytics engine as a common capability (ADR-0016 F13, F16, F11)

- **Status:** In progress (bounded continuation: retiring obsolete chart/query runtime and 103f manufacturing no-developer proof).
- **Work item:** WI-OI-103 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-103.md`.
- **Requirements:** FR-11, FR-12, FR-13, FR-14, NFR-SEC-001–005, NFR-DATA-001–004, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004.
- **Size:** M

## Goal

Retire the obsolete Analytics chart/query runtime (`v1/query/run`, `v1/charts`, `ChartService`, `QueryEngineService.runQuery`, etc.) and complete 103f with real manufacturing data and a fail-closed no-developer proof.

## Scope

- **May change:**
  - `modules/analytics-studio/apps/api/src/query-engine/` (retire obsolete `ChartService`, `ChartsController`, `QueryEngineService.runQuery`, obsolete DTOs/types)
  - Analytics API module and tests (`query-engine.module.ts`, `query-engine.spec.ts`, `route-permissions.spec.ts`, `analytics-truth-boundary.test.ts`)
  - Web BFF proxy tests (`apps/workflow-platform/lib/analytics-proxy.test.ts`, negative 404 assertions)
  - Dedicated fail-closed Playwright proof (`scripts/verify-manufacturing-no-developer.mjs` and helpers)
  - WI-OI-103 documentation and evidence (`.pi/tasks/WI-OI-103.md`, `.pi/work/WI-OI-103.md`, `.pi/NOW.md`)
- **Must not change:**
  - `QueryEngineService.runSpec` and replacement `query/spec` / `chart-views` / `dashboards` engine behavior
  - Applied database migrations (`000008` chart definitions table remains intact for history)
  - Existing legacy report migration error behavior
  - Port 5180 web runtime or running database without explicit owner authorization
  - Any files outside the authorized WI-OI-103 boundary

## Read first

- `AGENTS.md`
- `.pi/NOW.md`
- `.pi/tasks/FOUNDATION-CLOSE.md`
- `.pi/work/WI-OI-103.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`, F13

## Steps

1. Inventory runtime references to `ChartService`, `runQuery`, `v1/charts`, `v1/query/run`.
2. Remove `ChartsController` and `ChartService` from `query-engine.module.ts`. Remove `chart.service.ts` and `runQuery`/`RunQueryDto`.
3. Update route permission tests, add negative 404 tests for direct API and BFF proxy.
4. Create dedicated fail-closed Playwright proof `scripts/verify-manufacturing-no-developer.mjs` for manufacturing data.
5. Run targeted tests, `pnpm audit:sdlc`, `pnpm verify`, and real-database proof.
6. Await owner deployment authorization for live execution.

## Done when

- [x] Zero production-runtime imports or calls to `ChartService`, `runQuery(`, `v1/query/run`, `v1/charts`.
- [x] Retired endpoints return 404 from Analytics API and BFF proxy.
- [x] Fail-closed manufacturing no-developer proof script and helper test suite ready.
- [x] `pnpm verify` passes (only the known WORKFORCE_API_URL drift).
- [x] Evidence recorded in `.pi/work/WI-OI-103.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision or the owner has not settled.
- A step would change a running service, the database, or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
