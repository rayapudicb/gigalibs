# WI-OI-129 Project Operations — evidence

**Status:** Built (Module 7 slices S1–S7); through **`d6058703`** (2026-10-29).

## S1 (WBS schema) — `1c191256`

- Migration `000002_wbs_domain`: projects, phases, tasks, lines, issues, labor rates, timesheets; tenant RLS; `org_unit_id`.

## S2 (cost accrual) — `4dcf6eca`

- Pure engine: `cost-accrual.ts` + unit tests.

## S3 (WIP GL posting) — `4d942a9b`

- WIP relay → Finance projects inbox; migrations `000003` / Finance `000018`.

## S4 (T&M + milestone → AR) — `517fa98f`

- Billing requests, AR inbox `000019`, `ProjectArOutboxRelay`.

## S5 (Gantt + burn) — `dfba1acb`

- Insights API + `@gigalibs/project-operations-web`.

## S6 (timesheet approval) — `d6058703`

- API: approval queue, submit, approve, reject (`project-operations.timesheets.*`).
- UI: FocusModal approval drawer on `ProjectOperationsWorkspace`.

## S7 (E2E / PG proof) — `d6058703`

- `PROJECT_OPERATIONS_PG_PROOF=1` → `project-operations-journey.integration.test.ts` **3/3** (approve → T&M outbox; phase-1 milestone → AR draft; tenant RLS).
- Harness: `apps/api/scripts/throwaway-postgres.ts`.

## Verify note

Full `pnpm verify` not re-run this session; slice evidence: typecheck (project-operations-api, workflow-platform), PG 3/3, gantt-layout test.

## Deploy

Module 7 in owner batch deploy sequence (#7); relay credentials for Finance + AR as in compose codegen.
