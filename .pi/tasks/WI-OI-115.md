# WI-OI-115: Multi-Company Financial Consolidation & Intercompany Eliminations

- **Status:** Review
- **Work item:** WI-OI-115 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-115.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Multi-Company Consolidation & Intercompany Accounting Domain (`modules/financial-operations`)

## Goal

Deliver multi-company financial consolidation and intercompany eliminations extending General Ledger, Treasury, and Fixed Assets (`gigalibs_finance`), providing multi-entity consolidation groups, ownership share percentages, multi-currency foreign exchange translation (closing, average, historical rates with Cumulative Translation Adjustment / CTA reserve), automated bilateral intercompany matching and elimination journal generation, non-controlling interest (NCI) allocation, and consolidated financial statements.

## Scope

- **May change:**
  - `docs/architecture/ADR-0029-multi-company-financial-consolidation.md`
  - `packages/contracts/src/finance/` (new consolidation schemas, FX translation DTOs, elimination contracts, CloudEvents)
  - `modules/financial-operations/db/migrations/` (new forward migration `000004_finance_consolidation.up.sql`)
  - `modules/financial-operations/apps/api/src/` (consolidation service, translation engine, elimination engine, controllers)
  - `modules/financial-operations/web/src/` ("Consolidation Studio" tab in `FinancialOperationsWorkspace`)
  - `scripts/verify-consolidation.mjs`
  - `.pi/tasks/WI-OI-115.md`, `.pi/work/WI-OI-115.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules.

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` (§Stage F2 & F8)
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/architecture/ADR-0027-treasury-bank-reconciliation.md`
- `docs/architecture/ADR-0028-fixed-assets-depreciation-engine.md`
- `modules/financial-operations/module.yaml`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **CON-0** | Architecture & Threat Model | Author ADR-0029 establishing Consolidation group topologies, currency translation mechanics (IAS 21 / ASC 830), CTA equity reserve balancing invariants, bilateral elimination algorithms, and non-controlling interest accounting. |
| **CON-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` consolidation extensions (`ConsolidationGroupV1`, `ConsolidationEntityV1`, `ConsolidationFxRateV1`, `IntercompanyPairV1`, `ConsolidationRunV1`, `EliminationRuleV1`, `ConsolidationEntryV1`, input DTOs, and CloudEvents). |
| **CON-2** | Forward Migrations | Apply `000004_finance_consolidation.up.sql` to `gigalibs_finance` provisioning `consolidation_groups`, `consolidation_entities`, `consolidation_fx_rates`, `intercompany_pairs`, `consolidation_runs`, `consolidation_entries`, `consolidation_eliminations` with hardware RLS, immutability triggers, and check constraints. |
| **CON-3** | Consolidation Groups & Ownership Structure | Consolidation group setup, entity membership mapping, ownership share percentages, group reporting currency definition, and minority interest configuration. |
| **CON-4** | Foreign Exchange Translation Engine (IAS 21 / ASC 830) | Deterministic multi-currency translation from subsidiary functional currency to group reporting currency using closing rates (BS assets/liabilities), period average rates (P&L revenues/expenses), and historical rates (equity) with automated Cumulative Translation Adjustment (CTA) balancing, zero floating-point arithmetic. |
| **CON-5** | Intercompany Matching & Reconciliation Matrix | Intercompany trading relationships (Due-To / Due-From, Intercompany Sales / Purchases), automated discrepancy detection, and bilateral matrix reporting between legal entities. |
| **CON-6** | Automated Intercompany Elimination Engine | Execution of elimination rules generating balanced double-entry elimination journal entries in the consolidation ledger (clearing intercompany receivables/payables, intercompany sales/COGS, and intercompany dividends). |
| **CON-7** | Consolidated Financial Reporting & Audit Trail | Multi-entity consolidated trial balance, consolidated balance sheet, and consolidated income statement with subsidiary breakdown, elimination adjustment columns, and non-controlling interest lines. |
| **CON-8** | Web Consolidation Studio | Add "Consolidation Studio" tab to `FinancialOperationsWorkspace` with group hierarchy tree, intercompany matching matrix, run execution triggers, and drill-down consolidated statement preview with Safe AST validation. |
| **CON-9** | Real Database ACID Proof & Audits | Standalone verification script (`scripts/verify-consolidation.mjs`) certifying 10+ PostgreSQL 16 database scenarios and full `pnpm verify`. |

## Done when

- [x] ADR-0029 is authored and accepted.
- [x] Consolidation group, FX translation, and elimination schemas are compiled in `@gigalibs/contracts`.
- [x] Migration `000004` applies cleanly to `gigalibs_finance` with RLS policies and immutability triggers.
- [x] FX translation engine passes comprehensive tests with exact BigInt minor units and CTA reserve balance conservation.
- [x] Bilateral intercompany matching detects balances and flags discrepancies.
- [x] Automated elimination engine posts balanced elimination journal entries clearing intercompany positions.
- [x] Multi-entity consolidated trial balance, balance sheet, and income statements reflect accurate subsidiary contributions and net group figures.
- [x] Web workspace renders group hierarchy, matching matrix, and consolidated financial reports with Safe AST validation.
- [x] Standalone test script verifies 10+ real PostgreSQL 16 database scenarios.
- [x] `pnpm verify` passes cleanly with zero failures.
- [x] Evidence recorded in `.pi/work/WI-OI-115.md`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
