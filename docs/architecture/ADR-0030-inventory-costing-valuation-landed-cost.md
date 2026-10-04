# ADR-0030: Inventory Costing, Valuation, Landed Cost & Cost of Goods Sold (COGS) Engine

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-116
- **Depends on:** ADR-0016, ADR-0020, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0029

## Context

Operational inventory management in Phase 5 (`WI-OI-091`) established stock movements, reservations, bins, lots, and serial tracking in `gigalibs_inventory`. Phase 6 (`WI-OI-092`) established Procurement and PO goods receipts in `gigalibs_procurement`. Phase 7 (`WI-OI-093`) established Order fulfillment and shipments in `gigalibs_orders`. Phase 8 (`WI-OI-094`) established the double-entry General Ledger in `gigalibs_finance`.

However, the enterprise lacked an authoritative, IAS 2 / ASC 330 compliant **Inventory Costing, Valuation & Landed Cost Accounting Engine**:
1. Stock issues and sales order dispatches could not automatically determine their exact Cost of Goods Sold (COGS) under standardized accounting methods (FIFO, Moving Weighted Average, Standard Costing).
2. Ancillary landed costs (ocean freight, customs duties, tariffs, transit insurance, port handling) were not capitalized into inventory assets, causing distorted gross margins and distorted inventory balance sheet carrying values.
3. Purchase price variances (PPVs) between purchase order prices, invoice bills, and standard item costs were not systematically trapped and posted to General Ledger variance accounts.
4. Goods Received Not Invoiced (GRNI / AP Accrual) clearing was disconnected from physical inventory cost layers.
5. Periodic Lower of Cost or Net Realizable Value (NRV) impairments could not be recorded systematically with double-entry ledger impact.

Phase 12 (`WI-OI-116`) delivers the **Inventory Costing, Valuation, Landed Cost & COGS Engine** inside `modules/financial-operations` (`gigalibs_finance` v5), connecting operational inventory physical transactions to financial ledger vouchers with exact mathematical rigor and zero floating-point arithmetic.

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, signed token contexts. | Cost profile assignments, user permissions to approve landed cost vouchers. |
| **Arithmetic & Invariants** | Zero floating-point math; exact BigInt integer minor units for monetary balances and $10^6$ scaled integers for unit costs. Conservation of inventory value $\Delta \text{Asset} = \text{Inbound} - \text{COGS} \pm \text{Adjustments}$. | Currency display symbols, quantity formatting. |
| **Costing Engine** | Deterministic FIFO layer queue consumption, dynamic Moving Average recalculation on receipt, Standard Cost variance determination. | Method labels ("FIFO", "AVCO", "Standard"), cost center tags. |
| **Landed Cost Apportionment** | Exact weighted apportionment across goods receipt lines by Value, Gross Weight, Volume, or Quantity. | Surcharge category names ("Customs Duty", "Ocean Freight"). |
| **Audit & Immutability** | Database triggers prohibiting alteration or deletion of consumed cost layers, posted landed cost allocations, and sealed valuation snapshots. | Valuation run notes, inventory audit commentary. |

---

### 2. Inventory Costing Methodologies (IAS 2 / ASC 330)

Enterprises configure a `CostProfile` per product category or SKU:

1. **FIFO (First-In, First-Out):**
   - Each inbound goods receipt or positive adjustment creates an immutable `InventoryCostLayer` with `initial_quantity`, `remaining_quantity`, and `unit_cost_scaled`.
   - Outbound order fulfillments and issues consume layers in strict chronological order ($t_0, t_1, \dots$).
   - Total COGS equals the exact sum of consumed layers: $\text{COGS} = \sum (\text{consumed\_qty}_i \times \text{unit\_cost}_i)$.
2. **Moving Weighted Average (AVCO):**
   - Maintained continuously at the warehouse/location level:
     $$\text{Unit Cost}_{\text{new}} = \frac{(\text{Current Qty} \times \text{Current Unit Cost}) + (\text{Receipt Qty} \times \text{Receipt Unit Cost})}{\text{Current Qty} + \text{Receipt Qty}}$$
   - Handled with integer scaled units ($10^6$) to eliminate fractional drift.
3. **Standard Costing:**
   - Pre-determined standard cost per SKU.
   - When actual purchase cost differs from standard cost, the inventory asset is capitalized at standard cost, and the differential is immediately recognized as Purchase Price Variance (PPV):
     $$\text{PPV} = \text{Receipt Qty} \times (\text{Actual PO Unit Cost} - \text{Standard Unit Cost})$$
     - Unfavorable variance ($\text{Actual} > \text{Standard}$): Debit PPV Expense (5100).
     - Favorable variance ($\text{Actual} < \text{Standard}$): Credit PPV Expense (5100).

---

### 3. Landed Cost Engine & Capitalization

Landed costs represent third-party or supplementary expenses incurred to bring inventory to its present location and condition.

1. **Landed Cost Voucher:**
   - Aggregates external costs (Freight, Customs Duty, Port Handling, Storage, Insurance).
   - Links to one or more Purchase Goods Receipts (`gigalibs_inventory.receipts`).
2. **Allocation Bases:**
   - **By Value:** $\text{Weight}_i = \frac{\text{Line Value}_i}{\sum \text{Line Value}}$
   - **By Gross Weight:** $\text{Weight}_i = \frac{\text{Line Weight}_i}{\sum \text{Line Weight}}$
   - **By Volume:** $\text{Weight}_i = \frac{\text{Line Volume}_i}{\sum \text{Line Volume}}$
   - **By Quantity:** $\text{Weight}_i = \frac{\text{Line Quantity}_i}{\sum \text{Line Quantity}}$
3. **Layer Capitalization & GL Absorption:**
   - For FIFO: Extends the unit cost of existing unconsumed cost layers.
   - For Moving Average: Re-evaluates moving average unit cost.
   - General Ledger Journal Voucher:
     - **Debit:** Inventory Asset Account (e.g., 1400 Inventory)
     - **Credit:** Landed Cost Clearing / Accrual Account (e.g., 2020 Landed Cost Clearing)

---

### 4. Automated Double-Entry GL Journal Posting

Every physical inventory transaction produces an authoritative, immutable double-entry journal voucher via `FinanceService.postJournal()`:

1. **Inbound Purchase Receipt (GRNI Ingestion):**
   - **Debit:** 1400 Inventory Asset (at receipt / standard cost)
   - **Credit:** 2010 Goods Received Not Invoiced / GRNI Accrual
   - *(Optional PPV line if Standard Costing)*
2. **AP Vendor Bill Receipt Matching:**
   - **Debit:** 2010 Goods Received Not Invoiced / GRNI Accrual
   - **Credit:** 2000 Accounts Payable Control
   - *(Invoice Price Variance / IPV if bill unit cost differs from GRNI)*
3. **Sales Order Customer Shipment / Dispatch (COGS Posting):**
   - **Debit:** 5000 Cost of Goods Sold (COGS)
   - **Credit:** 1400 Inventory Asset
4. **Internal Work Order Consumption (CMMS Parts Usage):**
   - **Debit:** 6500 Maintenance & Parts Expense
   - **Credit:** 1400 Inventory Asset
5. **Inventory Scrap / Shrinkage Adjustment:**
   - **Debit:** 6600 Inventory Shrinkage & Scrap Expense
   - **Credit:** 1400 Inventory Asset
6. **Lower of Cost or Net Realizable Value (NRV) Impairment:**
   - **Debit:** 6610 Inventory Valuation Loss (P&L)
   - **Credit:** 1410 Inventory Valuation Allowance (Asset Contra)

---

### 5. Database Schema Extensions (`gigalibs_finance` v5)

All tables reside in `gigalibs_finance` with mandatory Row-Level Security (`tenant_isolation_policy`):

- `cost_profiles`: Tenant and category costing policy (FIFO, MOVING_AVERAGE, STANDARD_COST), GL account bindings.
- `inventory_cost_layers`: Inbound receipt layers with initial/remaining quantities, scaled unit costs, and status (`ACTIVE`, `EXHAUSTED`, `REVALUED`).
- `cost_layer_consumptions`: Audit log of exact layer quantities consumed by each shipment or issue transaction.
- `landed_cost_vouchers`: Landed cost batch header, allocation basis, total landed cost minor.
- `landed_cost_allocations`: Line-level landed cost apportionment to receipt lines and target cost layers.
- `inventory_revaluations`: Periodic NRV impairment runs and carrying value adjustments.

Hardware immutability trigger `trg_cost_layers_immutable` protects exhausted layers and posted ledger lines.

---

### 6. Consequences & Invariants

- **Zero Floating-Point Drift:** Monetary values are exact BigInt minor units; quantities and unit rates are scaled by $10^6$.
- **Perpetual Inventory Reconciliation:** At any point in time, $\sum \text{remaining\_quantity} \times \text{unit\_cost}$ across active layers matches the General Ledger Account 1400 balance.
- **Traceability:** Every cent of COGS on an income statement links to an immutable shipment reference and specific receipt cost layer.
