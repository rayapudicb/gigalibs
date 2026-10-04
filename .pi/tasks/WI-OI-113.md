# WI-OI-113: Commercial & Operational Module Convergence and Outbox-Inbox Handshake

- **Status:** In progress (Implementation & 12-Step Real Database Certification Complete, awaiting owner commit)
- **Work item:** WI-OI-113 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-113.md`.
- **Size:** XL, delivered across 6 production-ready slices C-1 through C-6
- **Depends on:** WI-OI-091, WI-OI-092, WI-OI-093, WI-OI-019 (bounded unfreeze for AR inbox), WI-OI-068, ADR-0007, ADR-0013, ADR-0016, ADR-0022, ADR-0023, ADR-0024, ADR-0026

### Architectural constraints & agreements recorded (2026-10-04)

- **Strict module isolation & zero cross-schema SQL:** Per ADR-0016, ADR-0022/23/24, and `audit:layers`, modules communicate exclusively via versioned contracts, APIs, and asynchronous outbox/inbox events (`crossSchemaAccess: false`). No module may query another module's database tables directly.
- **Canonical domain ownership:**
  - **Orders (`gigalibs_orders`):** Customer quotes, sales orders, fulfillment orchestration, and RMA.
  - **Inventory (`gigalibs_inventory`):** Physical warehouses, stock balances, deterministic reservations, picks, physical issues, and physical dispatch evidence (`receipts`, `receipt_lines`).
  - **Procurement (`gigalibs_procurement`):** Requisitions, POs, vendor AP bills, and 3-way matching decisions.
  - **Accounts Receivable (`gigalibs_ar`):** Customer invoices, credit notes, payment terms, installments, settlements, collections, and cryptographic ledger seals (`seal_hash`).
- **Zero phantom events:** Orders cannot emit dispatch events without prior physical inventory issue. General Ledger (Phase 8) will consume only authentic, verified operational facts.
- **Durable outbox-inbox relay:** Standardize `@gigalibs/module-sdk` OutboxRelay and InboxGuard across all four modules with FIFO leasing, back-off retries, and dead-letter handling.
- **Exact scaled-BigInt arithmetic:** Eradicate all `Number.parseFloat` across Inventory, Orders, and Procurement; implement a shared exact-decimal utility (BigInt scaled by $10^6$ for quantities, integer minor units for currency).
- **Expand/Migrate/Contract table evolution:** Redundant invoice tables in `gigalibs_orders` must be retired via forward expand/migrate/contract migrations, never altering applied migration `000001`.

## Goal

Establish durable, production-grade cross-module communication using `@gigalibs/module-sdk` outbox-inbox relays across Universal Inventory, Universal Procurement, Universal Orders, and Accounts Receivable. Enforce deterministic Available-to-Promise (ATP) stock reservations with row locks, authentic 3-way matching from Inventory receipt projections without cross-schema reads, physical inventory issue preceding fulfillment dispatch, and canonical AR customer invoice creation with cryptographic ledger seals.

## Scope

- **May change after approval:**
  - Forward migrations for `outbox_events` and `inbox_receipts` in `modules/universal-procurement`, `modules/universal-orders`, `modules/universal-inventory`, and bounded inbox extension in `modules/accounts-receivable`.
  - Service logic in `modules/universal-inventory` for deterministic reservation row locks, PO source references on `receipt_lines`, and physical stock issue.
  - Service logic in `modules/universal-procurement` for local receipt projections and 3-way matching without cross-schema SQL.
  - Service logic in `modules/universal-orders` for the reservation saga (`PENDING`/`CONFIRMED`/`REJECTED`) and fulfillment orchestration.
  - Web workspace components in `workflow-platform` to render visible allocation, matching, and invoicing pending/failure/retry states.
  - Shared scaled-BigInt exact-decimal utility in `packages/contracts` or `packages/module-sdk`.
  - Verification harness in `scripts/verify-commercial-operational-convergence.mjs`.
- **Must not change:** Never, on any card:
  - Phase 3 Core Parties master ownership (`@gigalibs/contracts/parties`);
  - Phase 4 Product Catalogue master ownership (`@gigalibs/contracts/catalogue`);
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - no deployment to the running web on port 5180 without owner approval.

## Read first

- `docs/architecture/ADR-0026-commercial-operational-convergence-and-ar-boundary.md`
- `docs/architecture/ADR-0024-universal-order-management-and-fulfillment-module.md`
- `docs/architecture/ADR-0007-cmms-workforce-contract-and-relay.md`
- `packages/module-sdk/src/outbox-relay.ts`
- `packages/module-sdk/src/inbox-receipts.ts`

## Slices

1. **C-1 (Governance, Contracts & Relay Infrastructure):**
   - Register `WI-OI-113` in SDLC governance; amend ADR-0024 via ADR-0026; record owner authorization for bounded `accounts-receivable` inbox work.
   - Freeze ownership, event schemas, and state machines in `@gigalibs/contracts`.
   - Deliver forward migrations adding relay-capable `outbox_events`, `inbox_receipts`, FIFO lease/settlement SQL functions, signed tokens, health checks, and runtime configs to all four modules (`universal-inventory`, `universal-procurement`, `universal-orders`, `accounts-receivable`).

2. **C-2 (Exact Decimal Math & Deterministic Inventory Reservation):**
   - Implement shared scaled-BigInt exact-decimal utility for all physical quantities and money amounts.
   - Repair `universal-inventory` stock reservations: deterministic `SELECT ... FOR UPDATE` row locks on `stock_balances`, dedicated `inventory_allocations` rows, non-negative DB check constraints, idempotency keys, concurrent-reservation protection, and automated release/expiry compensation.

3. **C-3 (Inventory Receipts Projection & 3-Way Matching Handshake):**
   - Add purchase order and PO line source references (`purchase_order_id`, `purchase_order_line_id`) to `receipt_lines` in `gigalibs_inventory`.
   - Emit `inventory.receipt.completed.v1` containing line-level quantities and PO references.
   - Implement consumer inbox in `universal-procurement` projecting receipt facts into tenant-scoped `procurement_receipt_projections`.
   - Update 3-way matching engine to validate PO vs local receipt projection vs vendor bill without cross-schema reads.

4. **C-4 (Orders ↔ Inventory Reservation & Physical Fulfillment Saga):**
   - Implement Orders ↔ Inventory allocation saga using explicit states: `PENDING_ALLOCATION -> ALLOCATION_CONFIRMED | ALLOCATION_REJECTED`.
   - Wire fulfillment pick and physical stock issue in `universal-inventory`. Physical inventory deduction must strictly precede an authoritative `orders.fulfillment.dispatched.v1` event.

5. **C-5 (Authoritative Fulfillment → Canonical AR Customer Invoicing):**
   - Emit `orders.fulfillment.dispatched.v1` containing confirmed physical shipment details.
   - `accounts-receivable` consumes event idempotently: resolves Party → AR customer billing profile, creates canonical customer invoice with installments and payment terms, seals the invoice with `seal_hash`, and emits `ar.invoice.issued.v1`.
   - `universal-orders` retains only an external invoice reference projection (`ar_invoice_id`, `status`).
   - Deprecate old invoice tables in `gigalibs_orders` through forward expand/migrate/contract migration.

6. **C-6 (End-to-End Real Database Certification & Resilience Proof):**
   - Deliver comprehensive multi-module certification script (`scripts/verify-commercial-operational-convergence.mjs`) executing against Docker PostgreSQL 16.
   - Certify: happy path, insufficient stock rejection, concurrent reservation races, order cancellation/release compensation, partial receipt/fulfillment/invoicing, cross-tenant isolation, event replay idempotency, consumer restart/outage, DLQ dead-lettering, duplicate-invoice prevention, numeric boundary tests, and correlation lineage.
   - Verify all SDLC audits pass 100%.

## Done when

- [x] All 6 slices C-1 through C-6 are implemented and verified.
- [x] No cross-schema SQL exists (`audit:layers` and `audit:api-boundary` pass).
- [x] Inventory reservations use deterministic row locks and exact-decimal arithmetic.
- [x] 3-way matching validates receipts through local projections from Inventory events.
- [x] Customer invoices are created, sealed, and managed exclusively in `accounts-receivable`.
- [x] No `Number.parseFloat` remains in Inventory, Orders, or Procurement.
- [x] Multi-module real-database proof passes 100% with resilience and failure scenarios.
- [x] `pnpm verify` passes.
- [x] Evidence recorded in `.pi/work/WI-OI-113.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A step would change a running service outside the four target modules, or modify the database outside their respective schemas.
- A requirement conflict arises between party billing terms and AR invoice constraints.

## Report

At most five short bullets: what changed, the evidence, what's next, and what the owner must decide.
