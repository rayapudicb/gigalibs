# WI-OI-117: Budgeting, Financial Planning, Commitment Accounting & Variance Control Engine

- **Status:** Review
- **Work item:** WI-OI-117 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-117.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Financial Planning & Commitment Accounting Domain (`modules/financial-operations`)

## Goal

Deliver Enterprise Architecture Phase 13: Budgeting, Financial Planning, Commitment Accounting, and Variance Control Engine, extending `gigalibs_finance` with multi-tier fiscal budget hierarchies, line allocations by Account/Cost-Center/Project/Period, real-time commitment accounting (Purchase Order encumbrances and liquidations), fail-closed over-budget spend enforcement policies (`HARD_STOP`, `ADVISORY_WARN`, `AUDIT_LOG`), versioned budget revisions with maker-checker approvals, and continuous Budget vs. Actual vs. Encumbered variance analytics.

## Scope

- **May change:**
  - `docs/architecture/ADR-0031-budgeting-commitment-accounting-variance-control.md`
  - `packages/contracts/src/finance/` (new budgeting and commitment schemas, DTOs, events)
  - `modules/financial-operations/db/migrations/000006_finance_budgeting_commitment_control.up.sql`
  - `modules/financial-operations/apps/api/src/budgeting/` (budgeting engine, commitment tracker, policy validator, services, controllers)
  - `modules/financial-operations/apps/api/src/app.module.ts`, `config.ts`, `index.ts`
  - `modules/financial-operations/module.yaml`
  - `modules/financial-operations/web/src/` ("Budgeting & Planning Studio" tab in `FinancialOperationsWorkspace`)
  - `scripts/verify-budgeting-and-commitment-control.mjs`
  - `scripts/verify.mjs`
  - `.pi/tasks/WI-OI-117.md`, `.pi/work/WI-OI-117.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules.

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md`
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/architecture/ADR-0030-inventory-costing-valuation-landed-cost.md`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **BDG-0** | Architecture & Threat Model | Author ADR-0031 establishing budget hierarchy models (Opex, Capex, Project), dimension granularity (Account, Cost Center, Project, Fiscal Period), commitment lifecycle (Pre-commitment, Encumbrance, Actualization, Release), fail-closed over-budget spend policies, and reconciliation invariants. |
| **BDG-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` budgeting extensions (`BudgetTypeEnum`, `BudgetRevisionStatusEnum`, `BudgetControlActionEnum`, `CommitmentTypeEnum`, `BudgetStructureV1`, `BudgetRevisionV1`, `BudgetLineV1`, `BudgetCommitmentV1`, `BudgetCheckResultV1`, DTOs, and CloudEvents). |
| **BDG-2** | Forward Migrations | Apply `000006_finance_budgeting_commitment_control.up.sql` to `gigalibs_finance` provisioning `budget_structures`, `budget_revisions`, `budget_lines`, `budget_commitments` with hardware RLS, immutability triggers, and check constraints. |
| **BDG-3** | Budget Structure & Revision Lifecycle | Manage multi-tier budget hierarchies, fiscal year bindings, versioned revisions (Draft -> Submitted -> Approved -> Active), and maker-checker segregation of duties. |
| **BDG-4** | Budget Line Allocation & Periodic Distribution | Multi-dimensional allocation engine distributing annual budgets across accounts, cost centers, projects, and fiscal periods with exact integer cent conservation. |
| **BDG-5** | Real-Time Commitment Accounting Engine | Encumbrance tracking for purchase requisitions and purchase orders; automated commitment liquidation upon AP bill posting or cancellation. |
| **BDG-6** | Fail-Closed Policy Enforcement Gate | Synchronous pre-flight spend verification evaluating available budget: Available = Budget - (Actuals + Commitments), enforcing `HARD_STOP` block or `ADVISORY_WARN` with zero floating-point arithmetic. |
| **BDG-7** | Continuous Budget vs Actual Variance Analytics | Real-time aggregation of Budgeted vs Committed vs Actual expenditures with variance analysis (favorable/unfavorable) and burn rate calculation. |
| **BDG-8** | Web Budgeting & Planning Studio | Add "Budgeting & Planning Studio" tab to `FinancialOperationsWorkspace` displaying budget hierarchy, revision history, line item allocation grid, and burn-down analytics. |
| **BDG-9** | Real Database ACID Proof & Audits | Standalone verification script (`scripts/verify-budgeting-and-commitment-control.mjs`) certifying 10+ PostgreSQL 16 database scenarios and full `pnpm verify`. |

## Done when

- [x] ADR-0031 is authored and accepted.
- [x] Budgeting and commitment schemas compiled in `@gigalibs/contracts`.
- [x] Migration `000006` applies cleanly to `gigalibs_finance` with RLS policies and immutability triggers.
- [x] Multi-tier budget structures and versioned revisions enforce maker-checker approvals.
- [x] Line allocation distributions conserve every single cent without rounding loss.
- [x] Purchase Order commitments accurately encumber funds and liquidate upon AP bill posting.
- [x] Spend enforcement gate strictly rejects over-budget transactions when `HARD_STOP` is configured.
- [x] Real-time Budget vs Actual vs Encumbered variance matches GL ledger facts.
- [x] Web workspace renders Budgeting & Planning Studio with live burn-down metrics.
- [x] Standalone test script verifies 10+ real PostgreSQL 16 database scenarios.
- [x] `pnpm verify` passes cleanly with zero failures.
- [x] Evidence recorded in `.pi/work/WI-OI-117.md`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
