# WI-OI-116: Inventory Costing, Valuation, Landed Cost & Cost of Goods Sold (COGS) Engine

- **Status:** Review
- **Work item:** WI-OI-116 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-116.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Inventory Valuation & Cost Accounting Domain (`modules/financial-operations` & `modules/universal-inventory`)

## Goal

Deliver Enterprise Architecture Phase 12: Inventory Costing, Valuation, Landed Cost Allocation, and Cost of Goods Sold (COGS) Accounting Engine, extending Universal Inventory (`gigalibs_inventory`), Universal Procurement (`gigalibs_procurement`), Orders (`gigalibs_orders`), and General Ledger (`gigalibs_finance`), providing IAS 2 / ASC 330 compliant costing methods (FIFO layer queues, Moving Weighted Average, Standard Costing), multi-factor landed cost capitalization (freight, duties, insurance, handling), Purchase Price Variance (PPV) accounting, automated double-entry COGS and GRNI absorption journal vouchers via `FinanceService.postJournal()`, periodic inventory revaluation/NRV impairment, and real-time gross margin analytics.

## Scope

- **May change:**
  - `docs/architecture/ADR-0030-inventory-costing-valuation-landed-cost.md`
  - `packages/contracts/src/finance/` (new costing, valuation, landed cost schemas, DTOs, events)
  - `modules/financial-operations/db/migrations/000005_finance_inventory_costing.up.sql`
  - `modules/financial-operations/apps/api/src/costing/` (costing engine, FIFO layers, moving average, landed cost calculator, variance processor, controllers)
  - `modules/financial-operations/web/src/` ("Costing & Landed Cost Studio" tab in `FinancialOperationsWorkspace`)
  - `scripts/verify-inventory-costing.mjs`
  - `.pi/tasks/WI-OI-116.md`, `.pi/work/WI-OI-116.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules.

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` (§Stage F7)
- `docs/plans/enterprise-architecture-phase-5-universal-inventory-warehouse-implementation-plan.md` (§6.9 Operational Valuation)
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/architecture/ADR-0026-commercial-operational-module-convergence.md`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **CST-0** | Architecture & Threat Model | Author ADR-0030 establishing inventory costing methodologies (FIFO, Moving Average, Standard Cost), landed cost apportionment models (by value, weight, volume, quantity), perpetual vs periodic accounting invariants, PPV tracking, and reconciliation to GL inventory asset accounts. |
| **CST-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` costing extensions (`CostingMethodEnum`, `CostLayerV1`, `LandedCostV1`, `LandedCostAllocationV1`, `InventoryValuationV1`, `CogsPostingV1`, `PriceVarianceV1`, input DTOs, and CloudEvents). |
| **CST-2** | Forward Migrations | Apply `000005_finance_inventory_costing.up.sql` to `gigalibs_finance` provisioning `cost_profiles`, `inventory_cost_layers`, `landed_cost_vouchers`, `landed_cost_allocations`, `inventory_revaluations` with hardware RLS, immutability triggers, and check constraints. |
| **CST-3** | Cost Profile & Valuation Configuration | Configure tenant/item-category costing profiles (FIFO, Moving Average, Standard Cost), default GL account mappings (Inventory Asset, GRNI/Accrued Purchases, COGS, Landed Cost Clearing, Purchase Price Variance, Inventory Scrap/Shrinkage). |
| **CST-4** | FIFO Layer Queue & Moving Average Engine | Deterministic integer-scaled cost engine maintaining inbound receipt cost layers, decrements upon shipment/issue in strict chronological FIFO sequence, and dynamic moving average recalculation upon receipt with zero floating-point arithmetic. |
| **CST-5** | Landed Cost Allocation Engine | Apportion additional freight, customs duties, insurance, and handling charges across purchase receipt lines using value, weight, volume, or quantity weighting, capitalizing extra costs directly into item cost layers and posting absorption GL journals. |
| **CST-6** | Automated COGS & Purchase Variance Journal Posting | Automated generation of balanced double-entry journal vouchers in the General Ledger: GRNI clearing upon receipt, COGS debit / Inventory credit upon sales order shipment, and PPV recognition when PO cost differs from standard cost. |
| **CST-7** | Lower of Cost or Net Realizable Value (NRV) Impairment | Support periodic inventory write-downs and revaluation, posting valuation impairment loss to GL while adjusting carrying value. |
| **CST-8** | Web Costing & Landed Cost Studio | Add "Costing & Landed Cost Studio" tab to `FinancialOperationsWorkspace` displaying valuation breakdown by category/location, active FIFO cost queues, landed cost voucher creator, and gross margin analysis. |
| **CST-9** | Real Database ACID Proof & Audits | Standalone verification script (`scripts/verify-inventory-costing.mjs`) certifying 10+ PostgreSQL 16 database scenarios and full `pnpm verify`. |

## Done when

- [x] ADR-0030 is authored and accepted.
- [x] Inventory costing, landed cost, and COGS schemas are compiled in `@gigalibs/contracts`.
- [x] Migration `000005` applies cleanly to `gigalibs_finance` with RLS policies and immutability triggers.
- [x] FIFO layer queue accurately consumes oldest cost layers with exact cent conservation.
- [x] Moving average recalculates dynamically upon inbound receipts with zero float errors.
- [x] Landed cost allocation correctly apportions freight/duties across receipt lines by value and weight.
- [x] Standard costing automatically posts Purchase Price Variance (PPV) to designated GL variance account.
- [x] Automated COGS journal posting debits COGS (5000) and credits Inventory (1400) upon order dispatch.
- [x] Web workspace renders costing profiles, FIFO layers, landed cost allocation wizard, and valuation report.
- [x] Standalone test script verifies 10+ real PostgreSQL 16 database scenarios.
- [x] `pnpm verify` passes cleanly with zero failures.
- [x] Evidence recorded in `.pi/work/WI-OI-116.md`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
