# ADR-0023: Universal Procurement, Vendor Operations, and 3-Way Matching — Ownership, Matching Engine, and Metadata Architecture

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-092
- **Depends on:** ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022

## Context

Operational intelligence and physical operations require a canonical, trustworthy system of record for purchasing, vendor relationships, procurement commitments, and accounts payable verification.
Historically:
- CMMS recorded vendor references as raw text strings without master entity linkage.
- Invoicing systems had accounts receivable but lacked an authoritative procure-to-pay (P2P) lifecycle with purchase requisitions, approval limits, and purchase orders.
- Inventory receiving (Phase 5, ADR-0022) emits expected receipt links (`purchaseOrderId`, `purchaseOrderLineId`) and replenishment requests when stock drops below minimum thresholds, but lacked a native purchasing authority to issue contractual POs.
- Without automated 3-way matching, accounts payable is vulnerable to overbilling, duplicate invoices, and payments for unreceived or damaged goods.

Phase 3 (`WI-OI-111`, ADR-0020) established canonical Core Parties (Suppliers, Vendors, Contacts).
Phase 4 (`WI-OI-112`, ADR-0021) established the canonical Product Catalogue, Purchasable Items, UOM conversions, and Purchase Price Lists.
Phase 5 (`WI-OI-091`, ADR-0022) established the Universal Inventory and Warehouse module with goods receiving and physical stock ledger.
Phase 6 now builds the **Universal Procurement and Payables** capability module (`modules/universal-procurement`).

## Decision

### 1. One Universal Procurement capability module

Create a selectable **Universal Procurement capability module** (`modules/universal-procurement`),
hosted in the shared module host by default (`crossSchemaAccess: false`). It is not part of the kernel.
Consumers interact strictly through versioned contracts (`@gigalibs/contracts/procurement`), authenticated APIs,
and asynchronous outbox events.

### 2. Isolated PostgreSQL schema

The module owns the dedicated PostgreSQL schema `gigalibs_procurement`.
All tables feature:
- Mandatory `tenant_id VARCHAR(64)` with composite primary/foreign keys.
- Forced Row-Level Security (RLS) bound to `app.current_tenant_id`.
- Optimistic concurrency control via `version INT NOT NULL DEFAULT 1`.
- Full audit stamps (`created_at`, `updated_at`, `created_by`, `updated_by`).

### 3. Canonical ownership and zero duplication

- **Vendor & Counterparty Authority:** Consumes Phase 3 `@gigalibs/contracts/parties`. The module never creates duplicate vendor or counterparty tables.
- **Product & Price Authority:** Consumes Phase 4 `@gigalibs/contracts/catalogue`. Purchase order lines reference canonical product IDs, base UOMs, and purchasing price lists.
- **Goods Receipt Authority:** Interacts with Phase 5 `@gigalibs/contracts/inventory`. Physical goods arrivals are received and inspected by Inventory; Procurement records contractual matches against receipt lines (`match_po_receipt_records`).

### 4. Requisitions and Delegation of Authority (DoA)

- `ProcurementRequisition`: Internal spend request initiated by department, project, or automated inventory replenishment.
- `ApprovalPolicy`: Defines spending threshold limits by organization unit and role (e.g. Supervisor $\le \$1,000$, Department Manager $\le \$10,000$, Executive $\le \$100,000$, Board $> \$100,000$).
- Multi-tier approval routing prevents unauthorized purchase orders from being issued.

### 5. Purchase Order lifecycle and revision management

- `PurchaseOrder`: Contractual commitment with vendor, payment terms, delivery address, shipping method, and currency.
- Statuses: `DRAFT | SUBMITTED | APPROVED | ISSUED | ACKNOWLEDGED | PARTIALLY_RECEIVED | RECEIVED | CLOSED | CANCELLED`.
- Version snapshots: Revisions to approved POs increment revision number, freeze previous terms, and require re-approval if net amount increases beyond tolerance.

### 6. Mathematical 3-Way Matching Engine

Automated verification verifies the core procurement invariant:
$$\text{Invoiced Qty} \le \text{Received Qty} \le \text{Ordered Qty}$$

- `MatchPoReceiptRecord`: Links PO Line $\leftrightarrow$ Inventory Goods Receipt Line. Updates cumulative `received_quantity`.
- `MatchPoInvoiceRecord`: Links PO Line $\leftrightarrow$ Vendor Bill Line. Updates cumulative `invoiced_quantity`.
- Price Variance Tolerance:
  $$\text{Variance \%} = \frac{|\text{Billed Unit Price} - \text{PO Unit Price}|}{\text{PO Unit Price}} \times 100$$
  - If $\text{Variance} \le 1.0\%$: Automatically cleared for payment.
  - If $\text{Variance} > 1.0\%$: System places invoice on `PRICE_VARIANCE_HOLD`. Requires explicit second-person maker-checker approval.

### 7. Strict financial arithmetic

- All currency amounts are stored and calculated in exact integer minor units (e.g. cents) or BigInt-safe strings (`MoneyMinorSchema`).
- Quantities are stored as exact numeric decimals bounded to 6 decimal places (`NUMERIC(18, 6)`).
- Zero JavaScript floating-point numbers (`number`) are permitted in persistent calculations.

### 8. Application Dictionary metadata embedding (Option A)

The module integrates with Phase 2 Application Dictionary (ADR-0019):
- Implements `ProcurementConfigurationAdapterV1` in `@gigalibs/playground-api`.
- Exposes dynamic field extension points on Requisitions, Purchase Orders, and Vendor Evaluations.
- Embeds `<DictionaryRenderer />` inside the web/tablet workspace (`UniversalProcurementWorkspace.tsx`).
- Employs Safe AST rules for custom spending validation without arbitrary runtime code execution.

## Threat Model & Security Controls

| Threat | Mitigation |
|---|---|
| **Tenant Data Bleed** | Mandatory composite primary keys including `tenant_id` and PostgreSQL forced RLS policies. |
| **Unauthorized Spend** | Server-side Delegation of Authority engine enforcing cryptographically signed context and permission checks. |
| **Vendor Overbilling / Double Billing** | Mathematical 3-way matching and vendor invoice idempotency hash (`(tenant_id, vendor_id, vendor_invoice_number)` unique constraint). |
| **Price Variance Fraud** | Automated holds on price variances $> 1.0\%$ requiring separate authorized approver. |
| **Prototype Pollution via Metadata** | Safe AST condition evaluation exclusively in `@gigalibs/configuration-core`. |

## Consequences

### Positive
- Closes the operational loop between Phase 5 inventory replenishment and Phase 3 vendor relationships.
- Guarantees mathematical protection against accounts payable fraud via strict 3-way matching.
- Operates 100% standalone (ERP-optional) while maintaining clean external integration adapters.
- Zero duplication of party, product, or inventory receipt masters.

### Negative
- Requires strict coordination between inventory warehouse staff (receiving) and procurement staff (billing).
- Requisition approval workflows require organizational hierarchy configuration in Phase 1 (`WI-OI-109`).
