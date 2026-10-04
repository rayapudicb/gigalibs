# Enterprise Architecture Phase 7 — Universal Order Management & Customer Fulfillment

- **Status:** Proposed implementation plan; ready for owner approval
- **Recorded:** 2026-10-04
- **Reserved roadmap item:** `WI-OI-093`, subject to SDLC Orchestrator reconciliation in `.pi/WORK_ITEMS.md`
- **Depends on:** 
  - WI-OI-109 Organization Hierarchy (Operating units, cost centers, sales organizations)
  - WI-OI-110 Application Dictionary (Checksummed manifests, Safe AST rules, UI metadata)
  - WI-OI-111 Core Parties (Customers, Billing contacts, Delivery addresses, Payment terms)
  - WI-OI-112 Product Catalogue & Pricing (Sellable products, UOM conversions, Sales price lists)
  - WI-OI-091 Universal Inventory (Stock availability, warehouse pick lists, dispatch shipments)
  - WI-OI-092 Universal Procurement (Vendor drop-ship linkage, back-to-back POs)
  - ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024
- **Requirements:** FR-01, FR-02, FR-04, FR-05, FR-08, FR-09, FR-10, FR-11, FR-12, FR-14, FR-15; applicable security, data, reliability, performance, accessibility, observability and operational NFRs

---

## 1. Executive Summary & Outcome

Phase 7 delivers one selectable, tenant-isolated **Universal Order Management and Customer Fulfillment** business capability module (`modules/universal-orders`). It becomes the canonical authority for:
1. **Sales Quotes & Customer Quotations**: Commercial proposals, pricing negotiations, discount matrices, and quote-to-order conversion.
2. **Sales Orders (SOs) & Order Types**: Standard sales, direct fulfillment, drop-ship, contracts, and return orders (RMA).
3. **Available-to-Promise (ATP) & Real-time Allocation**:
   $$\text{Allocated Quantity} \le \text{Available Physical Stock}$$
   Hard stock reservations against Phase 5 inventory to prevent double-selling.
4. **Fulfillment Orders & Pick/Pack/Dispatch Orchestration**:
   $$\text{Shipped Quantity} \le \text{Allocated Quantity} \le \text{Ordered Quantity}$$
   Warehouse pick directives, packing verification, shipping labels, and carrier tracking.
5. **Customer Invoicing (Accounts Receivable) & Billings**:
   $$\text{Invoiced Quantity} \le \text{Shipped Quantity} \quad \text{(for shipment-based billing)}$$
   Sales invoices in integer minor units, revenue recognition milestones, and customer credit memos.
6. **Customer Returns & RMA Processing**:
   Return Merchandise Authorization with receiving inspection integration into Phase 5 inventory returns.
7. **Application Dictionary Metadata Integration (Option A)**:
   Embeds dynamic metadata for sales channel attributes, priority ratings, delivery instructions, and Safe AST validation rules via `<DictionaryRenderer />`.

The module works **ERP-optional**: functions standalone as a complete, sovereign Order-to-Cash (O2C) suite without SAP, NetSuite, or external ERPs, while offering clean Connector Hub integration for external CRM or ERP systems.

---

## 2. Business Outcomes & Observable Invariants

| Outcome | Observable Invariant |
|---|---|
| **Zero Overselling / ATP Guarantee** | Confirmed orders immediately reserve stock in Phase 5 inventory; allocation cannot exceed available stock. |
| **Strict Fulfillment Invariant** | Outbound shipments cannot exceed allocated and ordered quantities ($\text{Shipped} \le \text{Allocated} \le \text{Ordered}$). |
| **Accurate Customer Invoicing** | Sales invoices match shipped quantities and authorized price lists without phantom billings. |
| **Zero Float Monetary Arithmetic** | All prices, taxes, discounts, and order totals are computed and stored as exact integer minor units (cents). |
| **No Duplicate Masters** | Consumes Phase 3 Core Parties for customers and Phase 4 Product Catalogue for items/prices. |
| **Tenant & Org Isolation** | Enforced via PostgreSQL Row-Level Security (RLS) on isolated schema `gigalibs_orders`. |
| **Audit & Outbox Integrity** | Immutable audit trail for order confirmations, fulfillment releases, and invoice issuances. |

---

## 3. Architecture & Domain Model

### 3.1 Isolated Database Schema (`gigalibs_orders`)
Following ADR-0016 and ADR-0024 principles, the module owns its dedicated schema:
- `sales_quotes` & `sales_quote_lines`
- `sales_orders` & `sales_order_lines`
- `order_inventory_allocations` (SO Line $\leftrightarrow$ Inventory Reservation)
- `fulfillment_orders` & `fulfillment_order_lines`
- `customer_invoices` & `customer_invoice_lines`
- `customer_returns` & `customer_return_lines`
- `customer_credit_memos` & `customer_credit_memo_lines`
- `audit_events` & `outbox_events`

### 3.2 Authority Matrix
- **Customers, Billing/Shipping Contacts**: Phase 3 (`@gigalibs/contracts/parties`).
- **Items, SKUs, UOMs & Governed Pricing**: Phase 4 (`@gigalibs/contracts/catalogue`).
- **Warehouse Stock, Pick Lists & Shipments**: Phase 5 (`@gigalibs/contracts/inventory`).
- **Procurement & Vendor Drop-ship**: Phase 6 (`@gigalibs/contracts/procurement`).
- **Customer Commercial Orders & AR Invoicing**: Phase 7 (`modules/universal-orders`).

---

## 4. Slice Plan (P7-0 through P7-9)

| Slice | Title | Deliverables | Verification Gate |
|---|---|---|---|
| **P7-0** | Architecture ADR-0024 & Threat Model | Author `docs/architecture/ADR-0024-universal-order-management-and-fulfillment-module.md` | Threat model, boundary validation, and invariant sign-off |
| **P7-1** | Public Contracts & Module Registration | `@gigalibs/contracts/orders` Zod schemas, DTOs, events; register in `modules/universal-orders/module.yaml` | `pnpm --filter @gigalibs/contracts build` |
| **P7-2** | Forward-Only Migration (`gigalibs_orders`) | `000001_orders_fulfillment_foundation.up.sql` with tables, constraints, RLS, immutability triggers | Migration replay in isolated PostgreSQL |
| **P7-3** | Sales Quotes & Pricing Resolution | Quotation drafting, validity dates, line discounts, Phase 4 price list resolution, quote conversion | Unit & integration tests for quotation lifecycle |
| **P7-4** | Sales Order Lifecycle & Revisions | SO drafting, order types (Standard, Drop-ship, RMA), line item pricing, status transitions | State machine verification (DRAFT -> CONFIRMED -> FULFILLED) |
| **P7-5** | Available-to-Promise (ATP) & Reservations | Real-time inventory allocation against Phase 5 `inventory_reservations` and `stock_balances` | ATP tests preventing over-allocation |
| **P7-6** | Fulfillment Orders & Dispatch Tracking | Warehouse fulfillment directives, pick/pack verification, carrier tracking, split shipments | Fulfillment invariant: `Shipped <= Allocated <= Ordered` |
| **P7-7** | Customer Invoices & Credit Memos | AR sales invoice generation, tax calculation, revenue accrual, RMA customer credit memos | Accounting balance verification, minor unit arithmetic |
| **P7-8** | Application Dictionary Adapter & UI | `OrderManagementConfigurationAdapterV1`, `<UniversalOrderWorkspace />` with `<DictionaryRenderer />` | Component compilation & Medusa UI preview |
| **P7-9** | Real PostgreSQL Certification & Audits | Multi-tenant, multi-org test harness (`real-database-proof.ts`), verify all 7 SDLC audits | 100% pass on real PostgreSQL container; `pnpm verify` clean |

---

## 5. Definition of Done

1. Dedicated schema `gigalibs_orders` isolated with runtime least-privilege role and forced RLS.
2. Full compliance with zero-float monetary arithmetic (minor units) and 6-decimal bounded quantities.
3. ATP reservation and fulfillment invariants proven mathematically on live PostgreSQL database.
4. Seamless consumption of Phase 3, 4, 5, and 6 contracts with zero master entity duplication.
5. Application Dictionary metadata embedding certified with Safe AST validation.
6. Real database integration proof passing 10+ end-to-end scenarios.
7. Mandatory SDLC audits (`node scripts/verify.mjs --audits`) passing cleanly with zero new violations.
