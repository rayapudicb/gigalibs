# ADR-0024: Universal Order Management and Customer Fulfillment — Ownership, ATP Allocation, and Metadata Architecture

- **Status:** Proposed
- **Date:** 2026-10-04
- **Work item:** WI-OI-093
- **Depends on:** ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023

## Context

Operational intelligence and physical distribution require an authoritative system of record for customer orders, commercial quotes, inventory allocation, fulfillment orchestration, and customer accounts receivable billing.

Historically:
- Earlier billing prototypes provided basic AR invoice forms without a structured Order-to-Cash (O2C) pipeline.
- Sales orders lacked real-time integration with warehouse inventory, creating risks of overselling and unfulfilled delivery promises.
- Inventory fulfillment (Phase 5, ADR-0022) provides physical pick lists and shipments, but requires an authoritative customer order domain to orchestrate order release, priority reservation, and shipment execution.
- Customer pricing lacked systematic adherence to Phase 4 governed price lists, customer tier discounts, and contractual rate cards.

Phase 3 (`WI-OI-111`, ADR-0020) established canonical Core Parties (Customers, Billing/Shipping Contacts, Payment terms).
Phase 4 (`WI-OI-112`, ADR-0021) established the canonical Product Catalogue, Sellable Items, UOM conversions, and Sales Price Lists.
Phase 5 (`WI-OI-091`, ADR-0022) established Universal Inventory, warehouse locations, physical stock ledgers, and reservations.
Phase 6 (`WI-OI-092`, ADR-0023) established Universal Procurement and vendor drop-ship linkage.
Phase 7 now establishes the **Universal Order Management and Customer Fulfillment** capability module (`modules/universal-orders`).

## Decision

### 1. One Universal Order Management capability module

Create a selectable **Universal Order Management capability module** (`modules/universal-orders`), hosted in the shared module host by default (`crossSchemaAccess: false`). It is not part of the kernel. Consumers interact strictly through versioned contracts (`@gigalibs/contracts/orders`), authenticated REST APIs, and asynchronous outbox events.

### 2. Isolated PostgreSQL schema (`gigalibs_orders`)

The module owns the dedicated PostgreSQL schema `gigalibs_orders`.
All tables feature:
- Mandatory `tenant_id VARCHAR(64)` with composite primary/foreign keys.
- Forced Row-Level Security (RLS) bound to `app.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')`.
- Optimistic concurrency control via `version INT NOT NULL DEFAULT 1`.
- Full audit stamps (`created_at`, `updated_at`, `created_by`, `updated_by`).

### 3. Canonical ownership and zero entity duplication

- **Customer & Counterparty Authority:** Consumes Phase 3 `@gigalibs/contracts/parties`. The module never creates duplicate customer or counterparty tables.
- **Product & Price Authority:** Consumes Phase 4 `@gigalibs/contracts/catalogue`. Order lines reference canonical product IDs, base UOMs, and sales price lists.
- **Warehouse & Inventory Authority:** Interacts with Phase 5 `@gigalibs/contracts/inventory`. Physical stock availability and shipment dispatch are managed via Inventory contracts; Order Management records commercial allocations and fulfillment lines.

### 4. Sales Quotations and Customer Inquiries

- `SalesQuote`: Customer pricing quotation, validity windows, payment terms, and promotional discounts.
- Quotation lifecycle: `DRAFT -> SUBMITTED -> ACCEPTED -> EXPIRED -> CONVERTED -> CANCELLED`.
- Direct quote-to-order conversion carrying over commercial terms and negotiated discounts.

### 5. Sales Orders & Available-to-Promise (ATP) Allocation

- `SalesOrder`: Commercial agreement with customer specifying delivery dates, addresses, carrier preferences, Incoterms, and payment terms.
- Order types: `STANDARD | DIRECT_FULFILLMENT | DROP_SHIP | CONTRACT | RETURN_ORDER`.
- Order lifecycle: `DRAFT -> SUBMITTED -> CONFIRMED -> PROCESSING -> PARTIALLY_FULFILLED -> FULFILLED -> CLOSED -> CANCELLED`.
- **Available-to-Promise (ATP) Invariant:**
  $$\text{Allocated Quantity} \le \text{Available Physical Stock}$$
  Upon order confirmation, stock is reserved against Phase 5 Universal Inventory to prevent overselling.

### 6. Fulfillment Orchestration and Dispatch

- `FulfillmentOrder`: Warehouse fulfillment directive grouping order lines for picking, packing, and dispatch.
- **Fulfillment Invariant:**
  $$\text{Shipped Quantity} \le \text{Allocated Quantity} \le \text{Ordered Quantity}$$
- Supports partial shipments, backorders, and split fulfillment across multiple distribution warehouses.

### 7. Customer Invoicing (AR) & Credit Memos

- `CustomerInvoice`: Accounts Receivable invoice generated against confirmed shipments or order milestones.
- **Invoicing Invariant:**
  $$\text{Invoiced Quantity} \le \text{Shipped Quantity} \quad \text{(for shipment-based billing)}$$
- `CustomerCreditMemo` / RMA processing for product returns, pricing adjustments, or damaged goods.
- Monetary values stored strictly as integer minor units (`subtotal_minor`, `tax_minor`, `discount_minor`, `total_amount_minor`).

### 8. Application Dictionary metadata architecture (Option A)

Following Phase 2, 4, 5, and 6 precedence:
- `OrderManagementConfigurationAdapterV1` conforms to `ModuleAdapterDescriptorV1Schema`.
- Registers dynamic extension slots: `order-header-custom-fields`, `fulfillment-custom-fields`.
- Workspace embeds `<DictionaryRenderer />` for custom sales channel attributes, priority ratings, and Safe AST validation rules.

### 9. ERP-Optional Operation

The module functions fully standalone as a sovereign Order-to-Cash solution without requiring SAP, NetSuite, or external ERPs. When an external ERP or CRM (e.g. Salesforce) is active, Connector Hub bidirectional synchronization maps orders and invoices cleanly via standard outbox events (`sales-order.confirmed.v1`, `sales-order.fulfilled.v1`, `customer-invoice.issued.v1`).

## Consequences

### Positive
- Unified Order-to-Cash journey linking customers, governed prices, warehouse reservations, and billing.
- Complete mathematical verification preventing overselling, over-shipping, and over-invoicing.
- Zero floating-point monetary discrepancies.
- Multi-tenant security with complete PostgreSQL schema isolation and forced RLS.
- Extensibility via Pure Declarative Application Dictionary metadata.

### Negative / Trade-offs
- Requires orchestration across Inventory and Catalogue contracts during order reservation and fulfillment.
- Strict state machine requires formal cancellation and return workflows rather than arbitrary record deletion.
