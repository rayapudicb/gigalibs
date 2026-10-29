# WI-OI-129 Project Operations — evidence

**Status:** In progress (Module 7); S1 in working tree (2026-10-29).

## S1 (WBS schema)

- Migration `000002_wbs_domain`: `projects`, `project_phases`, `project_tasks`, `project_lines`, `project_issues`, `labor_rates`, `timesheets` with forced tenant RLS; `org_unit_id` on projects.
- Contracts stub: `packages/contracts/src/projects/wbs.ts` (`ProjectV1Schema`).
- Runtime manifest + expected migration **2**.

## Next

- S2 cost-accrual engine (pure material + labor)
- S3 WIP GL posting; S4 T&M / milestone → AR; S5–S7 UI and E2E
