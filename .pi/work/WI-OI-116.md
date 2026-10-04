# WI-OI-116: Inventory Costing, Valuation, Landed Cost & Cost of Goods Sold (COGS) Engine — Evidence

- **Work item:** WI-OI-116
- **Domain:** SDLC Orchestrator / Inventory Valuation & Cost Accounting Domain (`modules/financial-operations` & `modules/universal-inventory`)
- **Status:** Review
- **Date:** 2026-10-04

---

## 1. Summary of Delivery

Delivered **Enterprise Architecture Phase 12: Inventory Costing, Valuation, Landed Cost & Cost of Goods Sold (COGS) Engine** extending `gigalibs_finance` (v5):
1. **Architecture & Standards (CST-0):** Authored `docs/architecture/ADR-0030-inventory-costing-valuation-landed-cost.md` establishing IAS 2 / ASC 330 costing methodologies (FIFO layer queues, Moving Weighted Average / AVCO, Standard Costing with Purchase Price Variance / PPV), multi-factor landed cost capitalization (ocean freight, customs duties, insurance, handling) apportioned across goods receipts by Value, Weight, Volume, or Quantity with exact cent conservation, automated double-entry GL journal posting via `FinanceService.postJournal()`, Lower of Cost or Net Realizable Value (NRV) impairment, and subledger-to-GL inventory asset reconciliation invariants.
2. **Contracts & Schemas (CST-1):** Delivered `@gigalibs/contracts/finance` costing extensions:
   - Reused `CostingMethodSchema` (`['STANDARD', 'FIFO', 'AVERAGE']`).
   - Enums: `COST_LAYER_STATUSES`, `LANDED_COST_ALLOCATION_BASES`, `LANDED_COST_STATUSES`, `REVALUATION_REASONS`, `COST_TRANSACTION_TYPES`.
   - Zod Schemas: `CostProfileV1Schema`, `InventoryCostLayerV1Schema`, `CostLayerConsumptionV1Schema`, `LandedCostV1Schema`, `LandedCostAllocationLineV1Schema`, `InventoryRevaluationV1Schema`, Input DTOs, reporting DTOs, and CloudEvents (`finance.costing.profile.created.v1`, `finance.costing.layer.created.v1`, `finance.costing.cogs.posted.v1`, `finance.costing.landed_cost.posted.v1`, `finance.costing.revaluation.posted.v1`).
   - Unit tests pass 6/6 in `packages/contracts/src/finance/costing.test.ts`.
3. **Forward Migrations (CST-2):** Applied `000005_finance_inventory_costing.up.sql` to `gigalibs_finance`:
   - Tables: `cost_profiles`, `inventory_cost_layers`, `cost_layer_consumptions`, `landed_cost_vouchers`, `landed_cost_allocations`, `inventory_revaluations`.
   - Hardware Row-Level Security enabled and forced on all 6 tables with `tenant_isolation_policy`.
   - Immutability triggers: `trg_cost_layers_immutable` and `trg_landed_costs_immutable`.
4. **Core Engine & Service (CST-3 to CST-7):**
   - Implemented `costing-engine.ts` with deterministic integer-scaled arithmetic (unit cost scale factor $10^6$, monetary amounts in BigInt minor cents) and zero floating-point math: FIFO layer depletion, moving weighted average recalculation, purchase price variance calculation, and landed cost apportionment with remainder reallocation to guarantee exact cent conservation. Unit tests pass 4/4 in `costing-engine.test.ts`.
   - Built `CostingService` in NestJS providing profile management, inbound goods receipt layer ingestion with GRNI GL accruals, outbound shipment FIFO/AVCO/Standard depletion with COGS GL vouchers, landed cost voucher creation & allocation with capitalized cost layer adjustment and absorption GL vouchers, Lower of Cost or NRV impairment write-downs with valuation loss GL vouchers, and real-time inventory valuation summary reporting.
   - Built `CostingController` with `@RequirePermissions` security guards.
   - Updated `modules/financial-operations/module.yaml` and regenerated manifests (49 routes verified).
5. **Web Workspace (CST-8):** Added "Costing & Landed Cost Studio" tab to `FinancialOperationsWorkspace.tsx` displaying valuation breakdown, active FIFO layers queue table, landed cost voucher list, and GL balance sheet reconciliation badges. Next.js production build verified.
6. **Real PostgreSQL 16 ACID Certification (CST-9):**
   - Built `scripts/verify-inventory-costing.mjs` certifying 12 database scenarios on port 5440.
   - Wired into `scripts/verify.mjs`.

---

## 2. Real Database Verification Scenarios Certified

1. **Contracts & Zod Schema Validation:** Full costing enums, DTOs, and event schema conformity verified.
2. **Database Schema & Migration v5:** Verified `schema_migrations` contains version 5; verified all 6 costing tables exist with forced RLS and triggers.
3. **Scenario 1 (GL Setup & Cost Profiles Configuration):** Provisioned accounting book, fiscal period, complete chart of accounts, and 3 Cost Profiles (FIFO for Finished Goods, Moving Average for Raw Materials, Standard Costing for Assemblies).
4. **Scenario 2 (Inbound Goods Receipts & FIFO Layers):** Ingested Receipt 1 (100 units @ $20.00 = $2,000.00) and Receipt 2 (100 units @ $25.00 = $2,500.00), posting balanced GRNI accrual journals ($4,500.00 debited to Inventory Asset 1400, credited to GRNI 2050).
5. **Scenario 3 (Deterministic FIFO Shipment & COGS Relief):** Dispatched 120 units against Sales Order; depleted Layer 1 (100 units @ $20 = $2,000, EXHAUSTED) and Layer 2 (20 units @ $25 = $500, PARTIALLY_CONSUMED, 80 remaining); posted balanced COGS journal ($2,500.00 debited to COGS 5000, credited to Inventory Asset 1400).
6. **Scenario 4 (Moving Weighted Average Continuous Recomputation):** Dynamically recalculated AVCO unit cost upon receipt (50 units @ $10 + 150 units @ $14 = 200 units @ exact $13.00/unit); posted balanced GRNI accrual journal ($2,600.00).
7. **Scenario 5 (Multi-Factor Landed Cost Capitalization):** Apportioned $200.00 ocean freight voucher across Layer 2 (80 units); adjusted unit cost from $25.00 to $27.50 with exact cent conservation; posted balanced Landed Cost absorption journal ($200.00 debited to Inventory Asset 1400, credited to Landed Cost Clearing 2060).
8. **Scenario 6 (Standard Costing & PPV):** Booked 50 units @ actual PO price $34 vs standard $30 ($1,700 total outlay); recognized $1,500.00 at standard and posted unfavorable Purchase Price Variance ($200.00 debited to PPV Expense 5100, $1,500.00 debited to Inventory 1400, $1,700.00 credited to GRNI 2050).
9. **Scenario 7 (Lower of Cost or NRV Periodic Impairment):** Recognized $5.00/unit market drop across 50 units ($250.00 write-down); posted balanced valuation loss journal ($250.00 debited to Valuation Loss 5200, credited to Inventory Asset 1400); revalued carrying layer.
10. **Scenario 8 (Database Immutability Triggers Protection):** Direct SQL `UPDATE` on `EXHAUSTED` cost layer and direct SQL `UPDATE` on `POSTED` landed cost voucher rejected by database triggers `trg_cost_layers_immutable` and `trg_landed_costs_immutable`.
11. **Scenario 9 (Hardware RLS Tenant Isolation):** Tested non-superuser tenant isolation via `rls_test_user`; verified Tenant B sees 0 rows from Tenant A across all 6 costing tables.
12. **Scenario 10 (Subledger-to-GL Balance Reconciliation):** Verified that active subledger layer carrying value ($6,050.00) matches General Ledger Inventory Asset (1400) net debit balance ($6,050.00) to the exact cent.

---

## 3. Verification Suite Evidence

```text
verify: full log /var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-04T12-46-01-598Z.log
PASS  build                          0 s   log line 1
PASS  test                          23 s   log line 443
PASS  audit:production-data          1 s   log line 1113
PASS  audit:all-runtime-data         0 s   log line 1145
PASS  audit:package-dependencies     1 s   log line 1178
PASS  audit:api-boundary             0 s   log line 1185
PASS  audit:navigation               0 s   log line 1193
PASS  audit:sdlc                     0 s   log line 1201
PASS  audit:layers                   1 s   log line 1220
PASS  module manifests               0 s   log line 1260
KNOWN deployment profile             0 s   log line 1307
      only the known WORKFORCE_API_URL drift
PASS  financial-operations           0 s   log line 1322
PASS  treasury-reconciliation        0 s   log line 1375
PASS  fixed-assets                   0 s   log line 1432
PASS  consolidation                  0 s   log line 1477
PASS  inventory-costing              0 s   log line 1522
RESULT: PASS (1 known drift)
```
