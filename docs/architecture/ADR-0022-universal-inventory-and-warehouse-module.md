# ADR-0022: Universal Inventory and Warehouse Operations — Ownership, Ledger, and Metadata Architecture

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-091
- **Depends on:** ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021

## Context

Operational intelligence and physical operations require a canonical, trustworthy system of record for inventory,
warehouses, stock balances, lot/serial traceability, receiving, kitting, reservations, and counts.
Historically:
- CMMS maintained storeroom part inventory inside `gigalibs_cmms` (migrations 000010 and 000019) tightly coupled to work orders.
- No general warehouse topology (zones, aisles, racks, bins, staging locations) existed outside maintenance storerooms.
- Stock movements were recorded as mutable balance adjustments rather than an immutable, double-entry ledger.
- External ERPs (SAP, Maximo, Oracle) have often been treated either as hard runtime dependencies or ignored entirely.

Phase 4 (`WI-OI-112`, ADR-0021) established the canonical Product Catalogue, UOM, and Pricing foundation.
Phase 5 now builds the **Universal Inventory and Warehouse** capability module.

## Decision

### 1. One Universal Inventory capability module

Create a selectable **Universal Inventory and Warehouse capability module** (`modules/universal-inventory`),
hosted in the shared module host by default (`crossSchemaAccess: false`). It is not part of the kernel.
Consumers interact strictly through versioned contracts (`@gigalibs/contracts/inventory`), authenticated APIs,
and asynchronous outbox events.

### 2. Isolated PostgreSQL schema

The module owns the dedicated PostgreSQL schema `gigalibs_inventory`.
All tables feature:
- Mandatory `tenant_id VARCHAR(64)` with composite primary/foreign keys.
- Forced Row-Level Security (RLS) bound to `app.current_tenant_id`.
- Optimistic concurrency control via `version INT NOT NULL DEFAULT 1`.
- Full audit stamps (`created_at`, `updated_at`, `created_by`, `updated_by`).

### 3. Immutable double-entry stock movement ledger

Every quantity change posts an immutable, balanced ledger transaction:
- `StockLedgerTransaction`: Command-level transaction header recording document reference, actor, reason, correlation ID, and idempotency key.
- `StockLedgerEntry`: Balanced quantity movement line with direction (`DEBIT` increases on-hand at destination, `CREDIT` decreases on-hand at origin).
- Compensating entries are used for corrections—never `UPDATE` or `DELETE` on ledger records.
- Supported movement reasons:
  `RECEIPT | PUTAWAY | TRANSFER | RESERVE | RELEASE | PICK | STAGE | ISSUE | RETURN | COUNT_GAIN | COUNT_LOSS | ADJUSTMENT | SCRAP | STATUS_CHANGE`.

### 4. Materialized rebuildable balance projection

`StockBalance` is a materialized projection optimized for low-latency queries.
The projection is indexed by `(tenant_id, warehouse_id, location_id, product_id, lot_id, serial_id, stock_status)`.
Invariants:
- Every `StockBalance` must be 100% reconstructable by replaying `StockLedgerEntry` rows from inception.
- A deterministic ledger reconciliation engine verifies projection integrity against ledger totals.

### 5. Strict numeric and invariant rules

- **Exact decimal arithmetic:** Quantities are stored as exact numeric decimals (bounded to 6 decimal places, e.g. `NUMERIC(18, 6)`) and serialized as strings. Floating-point arithmetic (`number` in JS) is strictly forbidden for persisted inventory quantities and costs.
- **No negative stock invariant:** Movements that would reduce physical on-hand quantity below zero are rejected fail-closed at both service and database constraint levels.
- **Phase 4 catalogue authority:** Products and UOMs reference Phase 4 `@gigalibs/contracts/catalogue`. The module never creates duplicate product, category, UOM, or price masters. All movements convert to base UOM using Phase 4 conversions.

### 6. Warehouse topology and organizational scoping

- Hierarchy: `InventoryWarehouse` -> `InventoryLocation` (zones, aisles, racks, shelves, bins, staging bays, quarantine areas).
- Scoping: Warehouses and locations bind to WI-OI-109 organization units and WI-OI-105 Places. Sibling organizations and cross-tenant access are rejected server-side.

### 7. Application Dictionary metadata embedding (Option A Standard)

Universal Inventory implements the **Option A: Enhanced Enterprise Hybrid Standard**:
- Relational ACID invariants (ledger, balances, RLS, reservations) are implemented in PostgreSQL and TypeScript.
- Dynamic variability (lot attributes, cold-chain temperature limits, Hazmat classifications, receiving inspection checklists, and bin property sheets) is 100% driven by the **Application Dictionary** (`WI-OI-110`).
- `InventoryConfigurationAdapterV1` is registered in `configuration-adapter.registry.ts`.
- Server-side Safe AST validation evaluates dynamic inspection checklists and lot storage rules.
- `<DictionaryRenderer />` is embedded in the web/tablet workspace (`UniversalInventoryWorkspace.tsx`).
- Transaction and lot snapshots store `manifest_checksum` for tamper-evident auditability.

### 8. CMMS convergence and staging kits

- CMMS consumes inventory via versioned reservation, issue, and return contracts.
- `InventoryReservation` supports soft (planning) and hard (allocated) holds for work orders.
- `InventoryKit` coordinates picking, staging bays, technician custody handoff, and unused material returns.
- CMMS storeroom tables remain during the transition period; new movements route through Inventory contracts.

### 9. Maker-checker variance approvals

- Cycle counts support blind counts and supervisor recount workflows.
- Variances exceeding tenant-configured thresholds (`varianceValueLimitMinor` or `varianceQuantityLimit`) require four-eyes approval (`inventory:adjust.approve`) by a distinct user from the counter.

### 10. ERP coexistence (ERP-optional)

- The module operates natively as system of record without any external ERP.
- For tenants with SAP, Maximo, or Oracle, Connector Hub synchronizes inventory facts through a declared authority matrix and transactional inbox/outbox, without making external systems runtime dependencies.

## Threat Model & Security Controls

| Threat | Mitigation |
|---|---|
| Cross-tenant inventory leakage | Forced PostgreSQL RLS on all `gigalibs_inventory` tables with composite tenant foreign keys. |
| Negative stock / phantom inventory | DB check constraints and transactional serializable balance verification. |
| Unauthorized inventory write-offs | Four-eyes maker-checker approval for adjustments above threshold. |
| Unsafe dynamic script execution | Safe AST validator rejects JavaScript `eval()`, prototypes, and unsanitized SQL. |
| Idempotency replay double-movement | Unique constraint on `(tenant_id, idempotency_key)` in `inventory_idempotency_records`. |
| Sibling org eavesdropping | Server-side validation of active organization context and Place containment. |

## Data Classification

| Entity / Field | Classification | Retention / Protection |
|---|---|---|
| Stock balances, locations, bins | INTERNAL | Retained for tenant lifecycle; encrypted at rest. |
| Valuation costs, purchase prices | CONFIDENTIAL | Restricted by `inventory:valuation.read`; redacted from standard logs. |
| Lot/serial custody, technician identity | INTERNAL / PII | Audit-logged with actor UUID; access controlled via RBAC. |
| Hazardous material specifications | RESTRICTED | Compliant with safety regulatory standards and hazmat flags. |
