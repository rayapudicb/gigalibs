# WI-OI-093: Universal Order Management and Customer Fulfillment (Phase 7)

- **Status:** Completed (Owner commit pending)
- **Work item:** WI-OI-093 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-093.md`.
- **Size:** XL, delivered across 10 slices P7-0 through P7-9
- **Depends on:** WI-OI-109, WI-OI-110, WI-OI-111, WI-OI-112, WI-OI-091, WI-OI-092, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024

### Architectural constraints & agreements recorded (2026-10-04)

- **Module isolation:** Selectable capability module `modules/universal-orders` owning isolated schema `gigalibs_orders`.
- **Zero master duplication:** Consumes Phase 3 Core Parties for customers/contacts and Phase 4 Product Catalogue for items/prices; never creates duplicate customer or product tables.
- **Warehouse & Inventory authority:** Consumes Phase 5 Universal Inventory `stock_balances`, `inventory_reservations`, and `shipments` via versioned contracts; never duplicates inventory ledgers.
- **ATP & Fulfillment invariants:** Mathematical verification:
  $$\text{Allocated Qty} \le \text{Available Physical Stock}$$
  $$\text{Shipped Qty} \le \text{Allocated Qty} \le \text{Ordered Qty}$$
- **Zero JS float arithmetic:** All money amounts stored as exact integer minor units (cents) or BigInt-safe strings; quantities bounded to 6 decimal places.
- **Metadata extensibility (Option A):** Core transactional integrity in PostgreSQL + Application Dictionary metadata embedding (`OrderManagementConfigurationAdapterV1`, Safe AST validation, `<DictionaryRenderer />`).
- **Customer Billing:** Generates AR customer invoices strictly matching shipped goods without phantom billings.

## Goal

Build one tenant- and organization-aware authority for customer quotations, sales orders, Available-to-Promise (ATP) inventory allocation, fulfillment orchestration, customer AR billing, and return authorizations (RMA), consumable via versioned contracts and manageable via a manifest-contributed web/tablet workspace.

## Scope

- **May change after approval:** `modules/universal-orders` module skeleton, contracts in `packages/contracts/src/orders`, schema `gigalibs_orders` migrations, API controllers/services, `OrderManagementConfigurationAdapterV1`, manifest-contributed web workspace (`UniversalOrderWorkspace.tsx`), gateway registration, and PostgreSQL verification harness.
- **Must not change:** Never, on any card:
  - Phase 3 Party master ownership (`@gigalibs/contracts/parties`);
  - Phase 4 Product/UOM master ownership (`@gigalibs/contracts/catalogue`);
  - Phase 5 Universal Inventory ledger and warehouse ownership (`@gigalibs/contracts/inventory`);
  - Phase 6 Universal Procurement ownership (`@gigalibs/contracts/procurement`);
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-7-universal-order-fulfillment-implementation-plan.md`
- `docs/architecture/ADR-0024-universal-order-management-and-fulfillment-module.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
- `docs/architecture/ADR-0020-core-parties-reference-adoption-and-bounded-custom-apps.md`
- `docs/architecture/ADR-0021-product-catalogue-uom-and-pricing-module.md`
- `docs/architecture/ADR-0022-universal-inventory-and-warehouse-module.md`
- `docs/architecture/ADR-0023-universal-procurement-and-payables-module.md`

## Steps

1. **P7-0:** Author ADR-0024 (`docs/architecture/ADR-0024-universal-order-management-and-fulfillment-module.md`) and threat model.
2. **P7-1:** Add versioned public contracts in `packages/contracts/src/orders` and module skeleton `modules/universal-orders`.
3. **P7-2:** Implement forward-only migrations for schema `gigalibs_orders` (quotes, sales orders, allocations, fulfillment, customer invoices, credit memos, RLS, audit/outbox).
4. **P7-3:** Implement sales quotations, pricing resolution via Phase 4 price lists, line discounts, and quote-to-order conversion.
5. **P7-4:** Implement sales order lifecycle, order types, line items, credit validation, order confirmations.
6. **P7-5:** Implement Available-to-Promise (ATP) real-time inventory allocation against Phase 5 inventory.
7. **P7-6:** Implement fulfillment order generation, warehouse pick/pack/shipment tracking, and split fulfillment handling.
8. **P7-7:** Implement customer AR billing, sales invoices, revenue accruals, and RMA credit memos in integer minor units.
9. **P7-8:** Implement Application Dictionary metadata adapter (`OrderManagementConfigurationAdapterV1`) and `<UniversalOrderWorkspace />`.
10. **P7-9:** Deliver real PostgreSQL multi-tenant certification harness (`real-database-proof.ts`) and verify all SDLC audits.

## Done when

- [x] ADR-0024 is accepted and recorded in `docs/architecture/`.
- [x] Schema `gigalibs_orders` runs under isolated role with strict RLS and composite tenant keys.
- [x] ATP and Fulfillment invariants are mathematically proven across SOs, allocations, and customer invoices.
- [x] Phase 3 Parties, Phase 4 Products, Phase 5 Inventory, and Phase 6 Procurement contracts are consumed without duplicate master tables.
- [x] Sales quote to order conversion preserves negotiated line pricing and commercial terms.
- [x] Customer AR invoices match shipped quantities with zero float rounding errors.
- [x] UI workspace embeds `<DictionaryRenderer />` for dynamic order header fields and priority classifications.
- [x] Real PostgreSQL certification harness passes 100% across two tenants and sibling organizations.
- [x] `pnpm verify` passes cleanly with only the known profile drift.
- [x] Evidence recorded in `.pi/work/WI-OI-093.md`, and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision or the owner has not settled.
- A consumer requires cross-schema access or duplicate customer/product/inventory authority.
- A step would change a running service, live database, or owner data.
- Inventory allocation logic is requested to permit hard reservations exceeding available stock.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide. Commit only when the owner says "commit".
