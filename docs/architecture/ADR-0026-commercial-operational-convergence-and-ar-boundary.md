# ADR-0026: Commercial, Operational, and Accounts Receivable Domain Boundaries, Outbox-Inbox Relays, and Inventory Invariants

- **Status:** Proposed
- **Date:** 2026-10-04
- **Work item:** WI-OI-113
- **Amends / Supersedes in part:** ADR-0024 (transfers customer invoicing authority to Accounts Receivable)
- **Depends on:** ADR-0007, ADR-0013, ADR-0016, ADR-0018, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024

## Context

During architectural review prior to Phase 8 (Financial Operations & General Ledger), inspection revealed critical boundary and integration gaps across the enterprise capability modules:
1. **Module Boundary Violations in Proposals:** Any proposal for cross-module queries (e.g. Orders querying `gigalibs_inventory` directly) violates ADR-0016, ADR-0022/23/24, and `audit:layers`. Modules must communicate strictly through versioned contracts, APIs, and durable outbox-inbox events (`crossSchemaAccess: false`).
2. **Duplicated & Misplaced AR Invoicing:** ADR-0024 allocated `customer_invoices` to `modules/universal-orders`. Meanwhile, `modules/accounts-receivable` (WI-OI-019) is a frozen 15,926-line AR subledger engine with real payment terms, installments, settlements, collections, and tamper-proof ledger seals (`seal_hash`). Placing invoicing in Orders duplicates core billing and bypasses canonical AR.
3. **Phantom Event Disconnect:** Orders could mark fulfillment dispatched without physical inventory issue, creating phantom events. Inventory reservations operated on unlocked aggregates with floating-point math. Procurement 3-way matching accepted unverified receipt IDs without checking actual receipt records in Inventory.
4. **Lack of Durable Relays:** While `@gigalibs/module-sdk` provides proven `OutboxRelay` and `InboxGuard` (established in WI-OI-068 CMMS ↔ Workforce), neither Procurement nor Orders implemented active relay processes or inbox receipt tables.

## Decision

### 1. Canonical Domain Boundaries & Ownership

The responsibilities of the four operational and financial subledger domains are strictly defined:

| Domain Module | Owning Schema | Canonical Business Authority | Explicitly NOT Owned (Anti-Patterns) |
|---|---|---|---|
| **`modules/universal-orders`** | `gigalibs_orders` | Customer quotes, sales orders, ATP reservation requests, fulfillment pick/pack orchestration, return authorizations (RMA). | **NOT an invoicing engine.** Must not own customer balance tables or issue unsealed invoices. |
| **`modules/universal-inventory`** | `gigalibs_inventory` | Physical warehouses, stock balances, lot/serial tracking, deterministic reservations, physical goods receipts (`receipts`, `receipt_lines`), pick verification, and physical stock issues. | **NOT a commercial engine.** Does not manage customer credit or commercial order pricing. |
| **`modules/universal-procurement`** | `gigalibs_procurement` | Purchase requisitions, Delegation of Authority, purchase orders, 3-way matching logic, vendor AP bills, and tolerance hold rules. | **NOT a warehouse manager.** Does not update stock levels directly; relies on receipt events from Inventory. |
| **`modules/accounts-receivable`** | `gigalibs_ar` | Canonical customer invoices, credit notes, billing contacts, payment terms, installments, cash settlements, dunning, aging analysis, and cryptographic ledger seals. | **NOT a fulfillment manager.** Does not determine shipping dispatch; generates invoices upon validated physical dispatch events. |

### 2. Amendment to ADR-0024 (Customer Invoicing Ownership)

ADR-0024 is hereby amended:
- Customer invoicing authority is **transferred exclusively to `modules/accounts-receivable`**.
- The temporary `gigalibs_orders.customer_invoices` and `customer_invoice_lines` tables will be deprecated and phased out via an expand/migrate/contract forward migration.
- `universal-orders` stores only an external reference projection (`ar_invoice_id`, `invoice_number`, `invoice_status`) returned asynchronously or synchronously from `accounts-receivable`.

### 3. Outbox-Inbox Relay Architecture (@gigalibs/module-sdk)

All four modules (`universal-inventory`, `universal-procurement`, `universal-orders`, and `accounts-receivable`) must adopt `@gigalibs/module-sdk` relay infrastructure:
- **`outbox_events` table:** Stores pending transactional events written within the domain transaction.
- **`inbox_receipts` table:** Deduplicates incoming messages with unique message IDs and tenant scope.
- **FIFO Lease & Settle Functions:** PostgreSQL RPC functions for leasing pending batches with back-off retry and settling (completed / dead-letter).
- **Relay Token Signing:** HMAC / asymmetric signed relay tokens preventing unauthorized cross-talk.

### 4. Event & Saga Workflows

#### A. Order Allocation & Inventory Reservation Saga (Orders ↔ Inventory)
1. Orders creates an allocation request with state `PENDING_RESERVATION`.
2. Emits `orders.allocation.requested.v1`.
3. Inventory consumes event, locks specific stock balance rows (`SELECT ... FOR UPDATE`), enforces nonnegative stock constraints, creates deterministic reservation rows, and emits:
   - `inventory.reservation.confirmed.v1` (if stock is available)
   - `inventory.reservation.rejected.v1` (if stock is insufficient)
4. Orders updates allocation state to `CONFIRMED` or `REJECTED`.

#### B. Goods Receipt & 3-Way Matching Handshake (Inventory → Procurement)
1. Physical goods arrive at warehouse. Inventory posts `receipts` and `receipt_lines` containing source PO reference (`purchase_order_id`, `purchase_order_line_id`).
2. Inventory issues stock balance increment and emits `inventory.receipt.completed.v1`.
3. Procurement consumes event into a local tenant projection `procurement_receipt_projections`.
4. Procurement 3-way match compares PO lines, local receipt projections, and vendor bill lines without cross-schema reads.

#### C. Fulfillment Dispatch & AR Invoicing Handshake (Inventory → Orders → AR)
1. Warehouse physically picks and issues inventory. Inventory executes physical stock issue deduction and emits `inventory.stock.issued.v1`.
2. Orders verifies physical issue receipt, marks order line `DISPATCHED`, and emits `orders.fulfillment.dispatched.v1`.
3. Accounts Receivable consumes `orders.fulfillment.dispatched.v1`:
   - Idempotently resolves customer billing setup from Phase 3 Core Parties.
   - Generates canonical AR customer invoice with payment terms and installments.
   - Computes cryptographic ledger seal (`seal_hash`, `seal_sequence`).
   - Emits `ar.invoice.issued.v1`.
4. Orders records `ar_invoice_id` in its local reference projection.

### 5. Exact-Decimal Arithmetic Standard

- Eliminate all `Number.parseFloat` and native IEEE 754 floating-point operations across Orders, Procurement, and Inventory.
- All monetary amounts must be stored and computed as exact integer minor units (BigInt-safe string).
- All physical quantities must use a shared scaled-BigInt decimal utility (bounded to 6 decimal places, scaled by $10^6$) to prevent penny drift or fractional quantity corruption.

## Consequences

### Positive
- Strict compliance with `audit:layers` and `crossSchemaAccess: false`.
- Zero phantom events: physical inventory issues strictly precede commercial dispatch and billing.
- Real 3-way matching and real ATP stock protection against physical stock balances.
- Clean foundation for Phase 8 General Ledger to subscribe to authentic, verified operational facts.

### Negative / Trade-offs
- Asynchronous saga states (`PENDING`, `CONFIRMED`, `REJECTED`) require robust UI pending states and timeout compensation.
- Requires bounded unfreezing of `modules/accounts-receivable` to add the relay consumer inbox.
