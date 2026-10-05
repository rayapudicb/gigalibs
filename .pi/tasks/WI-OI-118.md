# WI-OI-118: Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine

- **Status:** Review (committed `10bbfba`; migration 000007 is missing from the runtime manifest, so the module host cannot start at HEAD). Corrected by the WI-OI-119 audit (2026-10-05).
- **Work item:** WI-OI-118 (row 145 in `.pi/WORK_ITEMS.md`). Evidence in `.pi/work/WI-OI-118.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Period Close, Financial Health & Multi-Period Forecasting Domain (`modules/financial-operations`)

## Goal

Deliver Enterprise Architecture Phase 14: Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine, extending `gigalibs_finance` with granular subledger lockouts (AP, AR, Inventory, Fixed Assets, Treasury, GL), milestone-driven close checklists with maker-checker approvals, automated recurring accruals and prepayments/revenue deferrals amortization schedules (conserving every cent with day-1 next period auto-reversals), year-end retained earnings rollover engine (zeroing temporary P&L accounts into Retained Earnings equity with immutable closing journal vouchers), rolling multi-period financial forecasting integrating historical GL actuals and active budget commitments, and interactive financial statement drill-through down to subledger source documents.

## Scope

- **May change:**
  - `docs/architecture/ADR-0032-period-end-close-accruals-financial-forecasting.md`
  - `packages/contracts/src/finance/close.ts`, `packages/contracts/src/finance/close.test.ts`, `packages/contracts/src/finance/index.ts`
  - `modules/financial-operations/db/migrations/000007_finance_period_close_accruals_forecasting.up.sql`
  - `modules/financial-operations/apps/api/src/close/` (period close service, subledger lockout manager, accruals/deferrals amortization engine, year-end close engine, forecasting engine, drill-through service, controllers)
  - `modules/financial-operations/apps/api/src/app.module.ts`, `config.ts`, `index.ts`
  - `modules/financial-operations/module.yaml`
  - `modules/financial-operations/web/src/FinancialOperationsWorkspace.tsx` ("Period Close & Forecasting Studio" tab & drill-through views)
  - `scripts/verify-period-close-and-forecasting.mjs`
  - `scripts/verify.mjs`
  - `.pi/tasks/WI-OI-118.md`, `.pi/work/WI-OI-118.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules or previous financial migrations (1 through 6).

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` §F8
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/architecture/ADR-0031-budgeting-commitment-accounting-variance-control.md`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **CLS-0** | Architecture & Threat Model | Author ADR-0032 establishing subledger lockout mechanics (AP, AR, Inventory, Fixed Assets, Treasury, GL), close checklist state machines, accrual/prepayment/deferral amortization lifecycle with auto-reversals, year-end retained earnings rollover invariants, multi-period rolling forecasting formulas, and financial statement drill-through architecture. |
| **CLS-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` close & forecasting extensions (`SubledgerLockStatusEnum`, `SubledgerTypeEnum`, `ChecklistTaskStatusEnum`, `AmortizationTypeEnum`, `ForecastMethodEnum`, `PeriodSubledgerLockV1`, `PeriodCloseChecklistV1`, `AmortizationScheduleV1`, `YearEndCloseRunV1`, `FinancialForecastModelV1`, `FinancialHealthRatiosV1`, `StatementDrillThroughV1`, DTOs, and CloudEvents). |
| **CLS-2** | Forward Migrations | Apply `000007_finance_period_close_accruals_forecasting.up.sql` to `gigalibs_finance` provisioning `period_subledger_locks`, `period_close_checklists`, `accrual_amortization_schedules`, `accrual_amortization_lines`, `year_end_close_runs`, `financial_forecast_models`, and `financial_forecast_lines` with hardware RLS, check constraints, and immutability triggers. |
| **CLS-3** | Subledger Lockout & Checklist Orchestrator | Manage granular subledger lockout matrix (preventing AP bills, AR invoices, stock movements, depreciation, or manual journals in locked periods) and orchestrated period-close checklist milestones with maker-checker dual signoff. |
| **CLS-4** | Recurring Accruals & Deferrals Amortization Engine | Cent-conserving straight-line and scheduled amortization of prepaid expenses and deferred revenues (ASC 606 / IFRS 15), automated month-end expense accruals with automatic auto-reversal journal vouchers on the first day of the subsequent fiscal period. |
| **CLS-5** | Year-End Retained Earnings Rollover Engine | Compute fiscal year net income/loss across all temporary revenue and expense accounts; generate balanced, immutable closing journal voucher transferring net income to designated Retained Earnings equity account; finalize fiscal year lock. |
| **CLS-6** | Multi-Period Forecasting & Financial Health Analytics | Rolling 3/6/12-month projections based on GL historical run-rates, seasonality weights, and active budget encumbrances (`budget_commitments`); real-time financial health indicators (Current Ratio, Quick Ratio, Debt-to-Equity, Working Capital, Operating Margin). |
| **CLS-7** | Financial Statement Drill-Through Service & Controllers | Drill-through queries navigating from Balance Sheet and Income Statement line items directly to GL journal entries and subledger source documents; REST endpoints secured with signed tenant context and RLS. |
| **CLS-8** | Web Period Close & Forecasting Studio | Deliver "Period Close & Forecasting Studio" tab in `FinancialOperationsWorkspace` with subledger lockout toggles, close checklist tracker, accruals amortization manager, year-end rollover wizard, and forecasting visualization. |
| **CLS-9** | Real Database ACID Proof & Audits | Standalone certification script (`scripts/verify-period-close-and-forecasting.mjs`) validating 12+ real PostgreSQL 16 database scenarios on port 5440, integrating into `scripts/verify.mjs`, and passing clean `pnpm verify`. |

## Done when

- [x] ADR-0032 is authored and accepted.
- [x] Contracts and Zod schemas compiled in `@gigalibs/contracts`.
- [x] Migration `000007` applies cleanly to `gigalibs_finance` with hardware RLS and check constraints.
- [x] Subledger lockout engine blocks postings to locked subledgers while permitting open ones.
- [x] Accrual amortization schedules conserve every cent and post auto-reversals on period transition.
- [x] Year-end rollover zeros temporary P&L accounts and transfers net balance to Retained Earnings.
- [x] Multi-period forecasting accurately blends GL actuals with budget encumbrances.
- [x] Financial health ratios compute accurately from real ledger balances.
- [x] Standalone proof `scripts/verify-period-close-and-forecasting.mjs` passes 12+ PostgreSQL scenarios on port 5440.
- [x] Full `pnpm verify` suite passes with 0 regressions.
- [x] Task card and `.pi/WORK_ITEMS.md` updated with evidence in `.pi/work/WI-OI-118.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
