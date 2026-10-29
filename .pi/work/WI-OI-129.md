# WI-OI-129 Project Operations — evidence

**Status:** In progress (Module 7); S1–S3 committed through **`4d942a9b`** (2026-10-29).

## S1 (WBS schema) — `1c191256`

- Migration `000002_wbs_domain`: `projects`, `project_phases`, `project_tasks`, `project_lines`, `project_issues`, `labor_rates`, `timesheets` with forced tenant RLS; `org_unit_id` on projects.
- Contracts stub: `packages/contracts/src/projects/wbs.ts` (`ProjectV1Schema`).
- Runtime manifest + expected migration **2**.

## S2 (cost accrual) — `4dcf6eca`

- Pure engine: `packages/contracts/src/projects/cost-accrual.ts` (`accrueProjectCosts`, `computeProjectBudgetBurn`, `projectLineExtensionMinor`).
- Unit tests: `cost-accrual.test.ts`.

## S3 (WIP GL posting)

- Contract: `packages/contracts/src/projects/wip-relay.v1.ts` (`PROJECT_WIP_ACCRUAL_REQUESTED_V1`, Finance projects inbox audience).
- Project Operations migration `000003_project_wip_posting`: `project_cost_postings`, finance outbox + relay lease/settle.
- API: `POST v1/projects/:id/wip-accrual` (`project-operations.cost.post`); `CostPostingService` + finance relay worker.
- Finance migration `000018_finance_project_wip_accounts`: WIP + labor expense GL on `cost_profiles`; projects inbox Dr WIP / Cr inventory or labor expense.
- Compose codegen: `PROJECT_OPERATIONS_FINANCE_RELAY_*` in `scripts/module-manifests.mjs`.
- Static migration tests: `000003_project_wip_posting.test.ts`, `000018_finance_project_wip_accounts.test.ts` (2/2).
- Typecheck: `@gigalibs/project-operations-api`, `@gigalibs/financial-operations-api`.

## Next

- S4 T&M billing engine + milestone trigger → AR
- S5 Gantt + burn panel; S6 timesheet approval; S7 E2E
