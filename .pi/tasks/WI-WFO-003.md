# WI-WFO-003: Universal Payroll Admin & Expense Management

- **Status:** Review
- **Work item:** WI-WFO-003 (Payroll Admin & Expense Management). Evidence goes in `.pi/work/WI-WFO-003.md`.
- **Size:** M

## Goal

Deliver the universal payroll administration and frontline expense management vertical: multi-earning-line payroll periods with adjustment controls, period locking/closing checks, mileage & receipt expense claims, multi-format payroll export (ADP, SAP, CSV), and journal batch projection for ERP/iDempiere GL integration via Connector Hub.

## Scope

- **May change:**
  - `modules/gigaops/db/runtime-foundation/000023_wfo_expenses.up.sql` (and down migration)
  - `modules/gigaops/apps/api/src/expenses/*` (expense reports, lines, mileage)
  - `modules/gigaops/apps/api/src/payroll/*` (payroll admin controller, ERP journal batches)
  - `packages/contracts/src/workforce/universal.ts` (expense & payroll admin DTOs)
  - `apps/workflow-platform/components/gigaops/*` (PayrollAdminGrid, ExpenseAdminBoard, MyExpenses)
  - `.pi/work/WI-WFO-003.md` and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Live production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `WI_WFO_DELIVERY_MANIFEST.md` §WI-WFO-003
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md` §E-06, E-07
- `modules/gigaops/apps/api/src/gigaops.module.ts`

## Steps

1. **Governance & Pre-flight:**
   - Record `WI-WFO-003` in `.pi/WORK_ITEMS.md` and update `config/sdlc-governance.json` and `.pi/NOW.md`.
   - Create initial evidence file `.pi/work/WI-WFO-003.md`.
2. **Database Migrations:**
   - Write `000023_wfo_expenses.up.sql` (`wfo_expense_reports`, `wfo_expense_lines`) with forced RLS and down script.
3. **Contracts & API Layer:**
   - Add expense and payroll period DTOs in `@gigalibs/contracts`.
   - Implement `WfoExpensesService` and `WfoExpensesController` (reports, lines, mileage calculator, approvals).
   - Implement `WfoPayrollAdminService` and `WfoPayrollAdminController` (period grid, manual adjustments, period close, ERP GL journal batch generation).
4. **UI Workbench Integration:**
   - Implement `WfoPayrollAdminGrid.tsx` in `/gigaops` (period summary, worker earning rows, adjustments, export format).
   - Implement `WfoExpenseAdminBoard.tsx` (receipt inspection, mileage verification, approve/reject).
   - Wire into `GigaOpsWorkforceWorkbench.tsx`.
5. **Verification & Audit:**
   - Add unit tests for mileage calculation, expense approval rules, and period close constraints.
   - Run `pnpm verify` (must pass with known drift only).
   - Update evidence in `.pi/work/WI-WFO-003.md` and `.pi/NOW.md`.

## Done when

- [x] Migration `000023_wfo_expenses.up.sql` and `.down.sql` written with RLS and constraints.
- [x] Expense reporting, mileage calculation (IRS/local rate), and receipt tracking operational.
- [x] Payroll admin grid with adjustments, period locking, and close validation functional.
- [x] ERP GL journal batch generation formatted for Connector Hub integration.
- [x] `pnpm verify` passes cleanly across all packages and audits.
- [x] Evidence recorded in `.pi/work/WI-WFO-003.md`.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service or live owner data without authorization.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
