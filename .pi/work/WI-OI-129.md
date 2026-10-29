# WI-OI-129 Project Operations — evidence

**Status:** In progress (Module 7); S1–S4 committed through **`517fa98f`**; **S5 in working tree** (2026-10-29).

## S1 (WBS schema) — `1c191256`

- Migration `000002_wbs_domain`: `projects`, `project_phases`, `project_tasks`, `project_lines`, `project_issues`, `labor_rates`, `timesheets` with forced tenant RLS; `org_unit_id` on projects.
- Contracts stub: `packages/contracts/src/projects/wbs.ts` (`ProjectV1Schema`).
- Runtime manifest + expected migration **2**.

## S2 (cost accrual) — `4dcf6eca`

- Pure engine: `packages/contracts/src/projects/cost-accrual.ts` (`accrueProjectCosts`, `computeProjectBudgetBurn`, `projectLineExtensionMinor`).
- Unit tests: `cost-accrual.test.ts`.

## S3 (WIP GL posting) — `4d942a9b`

- Contract: `packages/contracts/src/projects/wip-relay.v1.ts` (`PROJECT_WIP_ACCRUAL_REQUESTED_V1`, Finance projects inbox audience).
- Project Operations migration `000003_project_wip_posting`: `project_cost_postings`, finance outbox + relay lease/settle.
- API: `POST v1/projects/:id/wip-accrual` (`project-operations.cost.post`); `CostPostingService` + finance relay worker.
- Finance migration `000018_finance_project_wip_accounts`: WIP + labor expense GL on `cost_profiles`; projects inbox Dr WIP / Cr inventory or labor expense.
- Compose codegen: `PROJECT_OPERATIONS_FINANCE_RELAY_*` in `scripts/module-manifests.mjs`.
- Static migration tests: `000003_project_wip_posting.test.ts`, `000018_finance_project_wip_accounts.test.ts` (2/2).
- Typecheck: `@gigalibs/project-operations-api`, `@gigalibs/financial-operations-api`.

## S4 (T&M + milestone → AR) — `517fa98f`

- Pure billing: `packages/contracts/src/projects/tm-billing.ts`; relay payload `ar-relay.v1.ts` (`PROJECT_INVOICE_DRAFT_REQUESTED_V1`, `AR_PROJECTS_INBOX_AUDIENCE`).
- Migration `000004_project_billing_ar`: `project_billing_requests`, timesheet linkage, `relay_lease_project_ar_events`.
- API: `POST …/bill-time-materials`, `POST …/bill-milestone` (`project-operations.billing.post`); `ProjectArOutboxRelay`.
- AR migration `000019_ar_project_billing_source`: `source_project_billing_id`; `ProjectsBillingInboxController` + `issueInvoiceFromProjectBilling`.
- Compose: `PROJECT_OPERATIONS_AR_RELAY_*`, `AR_PROJECTS_INBOX_RELAY_PUBLIC_KEY_BASE64`.
- Tests: `tm-billing.test.ts`, migration static tests, `projects-billing-inbox.test.ts`.

## S5 (Gantt + burn panel) — working tree

- Contracts: `packages/contracts/src/projects/insights.v1.ts` (gantt + burn matrix DTOs).
- API: `GET v1/projects`, `GET v1/projects/:id/gantt`, `GET v1/projects/:id/burn-matrix` (`project-operations.insights.read`); `InsightsService` uses `accrueProjectCosts` + `computeProjectBudgetBurn`.
- Web: `@gigalibs/project-operations-web` (`ProjectOperationsWorkspace` — project picker, burn summary/table, read-only Gantt bars).
- Workflow platform page wired via `module.yaml` + `pnpm modules:catalog`.
- Test: `gantt-layout.test.ts`.

## Next

- S6 timesheet approval queue; S7 E2E
