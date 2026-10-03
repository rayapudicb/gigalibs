# WI-EAM-003 Evidence: Maintenance Manuals, Standard Procedures & Failure Mode Hierarchy

## What changed

### Migration 17 (up + down)
- `cmms_failure_codes`: ISO 14224 failure hierarchy — `type` (PROBLEM / CAUSE / REMEDY), `code`, `description`, self-referencing `parent_code_id` FK, `classification_id` FK to asset classifications. Composite PK `(tenant_id, id)`, forced RLS on `app.tenant_id`.
- `cmms_job_plans`: SOP/Job Plan templates — `code`, `title`, `description`, `estimated_duration_minutes`, `safety_guidelines`, `classification_id` FK. Composite PK, forced RLS.
- `cmms_job_plan_tasks`: sequential checklist tasks — `sequence`, `label`, `task_type` (INSPECTION/LUBRICATION/REPLACEMENT/CALIBRATION/SAFETY_CHECK), `required`, `estimated_minutes`. Composite PK, forced RLS.
- Altered `work_orders` table: added `failure_problem_id`, `failure_cause_id`, `failure_remedy_id`, `job_plan_id` (all nullable FKs with ON DELETE SET NULL).
- `runtime-manifest.txt` updated, `CMMS_SCHEMA_CONTRACT_VERSION = 17`.

### Contracts (`@gigalibs/contracts`)
- `CmmsFailureCodeTypeV1Schema` (PROBLEM/CAUSE/REMEDY)
- `CreateCmmsFailureCodeV1Schema`, `UpdateCmmsFailureCodeV1Schema`, `CmmsFailureCodeV1`, `CmmsFailureHierarchyNodeV1`
- `CmmsJobPlanTaskTypeV1Schema` (5 task types), `CreateCmmsJobPlanTaskV1Schema`, `CmmsJobPlanTaskV1`
- `CreateCmmsJobPlanV1Schema`, `UpdateCmmsJobPlanV1Schema`, `CmmsJobPlanV1`
- `ApplyCmmsJobPlanV1Schema`, `RecordCmmsFailureAttributionV1Schema`
- `CmmsWorkOrderV1` and create/update schemas extended with `jobPlanId`, `failureProblemId`, `failureCauseId`, `failureRemedyId`

### Backend (`@gigalibs/cmms-api`)
- **`ReliabilityService`** — full CRUD for failure codes (with deletion guard against in-use work orders), job plan CRUD with atomic task replacement, `applyJobPlanToWorkOrder` (expands tasks onto WO, sets FK), `recordFailureAttribution` (validates referenced codes exist).
- **`ReliabilityController`** — REST endpoints matching the service methods; `@UseGuards(CmmsAuthorizationGuard)`, `@RequirePermissions('cmms.assets.read'|'cmms.assets.write')`.
- **`ReliabilityModule`** — registered in `AppModule` via `imports: [DatabaseModule, ReliabilityModule]`.
- **`WorkOrdersService` updated** — `WO_COLUMNS` + `WO_FROM` enriched with 4 LEFT JOINs (job_plans + 3x failure_codes), `mapWorkOrder` maps the 4 new FK fields, `mapWorkOrderDetailExtras` provides enriched labels (jobPlanTitle, failureProblemCode, failureCauseCode, failureRemedyCode), `createWithClient` persists the new nullable columns.

### Web API Client (`modules/physical-operations-cmms/web/src/api.ts`)
- Added imports: `CmmsFailureCodeV1`, `CmmsFailureHierarchyNodeV1`, `CmmsJobPlanV1`
- New methods: `listFailureHierarchyTree`, `listFailureCodes`, `createFailureCode`, `updateFailureCode`, `deleteFailureCode`, `listJobPlans`, `getJobPlan`, `createJobPlan`, `updateJobPlan`, `applyJobPlan`, `recordFailureAttribution`

### Web UI (`CmmsWorkOrders.tsx`)
- **`FailureAnalysisCard`** component: current attribution summary (problem/cause/remedy codes, job plan title), cascaded Problem → Cause → Remedy dropdowns, save attribution button, job plan selector with safety/LOTO guidance panel (surfacing `safetyGuidelines` + SAFETY_CHECK task types), "Apply SOP tasks to work order" button.

## Evidence

- `pnpm --filter @gigalibs/contracts build` — 0 errors
- `pnpm --filter @gigalibs/cmms-api build` — 0 errors
- `pnpm --filter @gigalibs/workflow-platform exec tsc --noEmit` — 0 errors
- `scripts/verify-eam-reliability-and-job-plans.mjs` — **48/48 checks pass**
- Unit tests: `reliability.service.spec.ts` — **14/14 passing**
- `pnpm verify --audits` — **PASS** (1 known WORKFORCE_API_URL drift)

## Files created

| File | Purpose |
|------|---------|
| `modules/physical-operations-cmms/db/migrations/000017_eam_failure_hierarchy_and_job_plans.up.sql` | Migration 17 up |
| `modules/physical-operations-cmms/db/migrations/000017_eam_failure_hierarchy_and_job_plans.down.sql` | Migration 17 down |
| `modules/physical-operations-cmms/apps/api/src/reliability/reliability.service.ts` | ReliabilityService |
| `modules/physical-operations-cmms/apps/api/src/reliability/reliability.controller.ts` | ReliabilityController |
| `modules/physical-operations-cmms/apps/api/src/reliability/reliability.module.ts` | ReliabilityModule |
| `modules/physical-operations-cmms/apps/api/src/reliability/reliability.service.spec.ts` | Unit tests (14 tests) |
| `scripts/verify-eam-reliability-and-job-plans.mjs` | Verification script (48 checks) |

## Files modified

| File | Change |
|------|--------|
| `packages/contracts/src/cmms/index.ts` | Failure code + Job Plan + Attribution schemas and interfaces |
| `modules/physical-operations-cmms/apps/api/src/runtime-config.ts` | Version 16 → 17 |
| `modules/physical-operations-cmms/db/runtime-manifest.txt` | Added migration 17 |
| `modules/physical-operations-cmms/apps/api/src/app.module.ts` | Import + register ReliabilityModule |
| `modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts` | WO_COLUMNS/WO_FROM JOINs, mapWorkOrder 4 new fields, createWithClient persist, detail extras |
| `modules/physical-operations-cmms/web/src/api.ts` | 11 new reliability API methods |
| `modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx` | FailureAnalysisCard component |
