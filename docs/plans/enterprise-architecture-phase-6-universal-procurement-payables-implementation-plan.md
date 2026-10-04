# Enterprise Architecture Phase 6 — Universal Procurement, Vendor Operations & 3-Way Matching

- **Status:** Proposed implementation plan; ready for owner approval
- **Recorded:** 2026-10-04
- **Reserved roadmap item:** `WI-OI-092`, subject to SDLC Orchestrator reconciliation in `.pi/WORK_ITEMS.md`
- **Depends on:** 
  - WI-OI-109 Organization Hierarchy (Cost centers, operating units, approval chains)
  - WI-OI-110 Application Dictionary (Checksummed manifests, Safe AST rules, UI metadata)
  - WI-OI-111 Core Parties (Suppliers, Vendors, Contacts, Payment terms)
  - WI-OI-112 Product Catalogue & Pricing (Purchasable items, UOM conversions, purchase price lists)
  - WI-OI-091 Universal Inventory (Inbound receiving, goods receipts, inspection disposition)
  - ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022
- **Requirements:** FR-01, FR-02, FR-04, FR-05, FR-08, FR-09, FR-10, FR-11, FR-12, FR-14, FR-15; applicable security, data, reliability, performance, accessibility, observability and operational NFRs

---

## 1. Executive Summary & Outcome

Phase 6 delivers one selectable, tenant-isolated **Universal Procurement and Payables** business capability module (`modules/universal-procurement`). It becomes the canonical authority for:
1. **Purchase Requisitions & Delegation of Authority (DoA)**: Spending requests, multi-tier approval chains based on monetary thresholds, and requisition-to-PO conversion.
2. **Purchase Orders (POs) & Lifecycle Management**: Contractual orders, revision tracking, multi-line pricing, delivery schedules, Incoterms, and supplier acknowledgements.
3. **Goods Receipt Linkage & Quantity Tracking**: Direct integration with Phase 5 Universal Inventory receipts without duplicate receiving models.
4. **Automated 3-Way Matching Engine**:
   $$\text{Invoiced Qty} \le \text{Received Qty} \le \text{Ordered Qty}$$
   Cross-verifying PO lines, Inventory goods receipts, and Vendor AP bills.
5. **Price & Quantity Variance Tolerance Engine**:
   Automated tolerance checks (< 1% auto-accepted; >= 1% triggers Price Variance Hold and maker-checker approval).
6. **Vendor Invoices, Bills & Debit Memos**:
   System of record for vendor bills, debit adjustments for damaged/returned goods, payment schedule maturation, and unearned discount optimization.
7. **Application Dictionary Metadata Integration (Option A)**:
   Embeds dynamic metadata for custom vendor qualification forms, purchase category attributes, and Safe AST validation rules via `<DictionaryRenderer />`.

The module works **ERP-optional**: functions standalone as a complete, sovereign Procure-to-Pay (P2P) suite without SAP, Oracle, or external finance engines, while offering clean Connector Hub integration when an external ERP is the client's financial ledger of record.

---

## 2. Business Outcomes & Observable Invariants

| Outcome | Observable Invariant |
|---|---|
| **Zero Unauthorized Spend** | Every purchase order above delegation threshold requires cryptographic / recorded managerial approval before issuance. |
| **Strict 3-Way Match Verification** | Vendor bills cannot be approved for payment without matching against authorized PO prices and physically received goods receipt lines. |
| **Variance Control & Fraud Prevention** | Price variances above tenant tolerance (default 1.0%) trigger automatic payment holds and require documented variance disposition. |
| **No Duplicate Masters** | Consumes Phase 3 Core Parties for vendors and Phase 4 Product Catalogue for items/prices. Zero duplicate supplier or product master tables. |
| **Seamless Goods Receipt Relay** | Connects to Phase 5 Universal Inventory `receipts` and `receipt_lines` via versioned contracts. |
| **Zero Float Financial Arithmetic** | All money values handled as exact integer minor units (cents) or BigInt-safe strings. Zero floating-point rounding leakage. |
| **Tenant & Org Isolation** | Enforced via PostgreSQL 16 Row-Level Security (RLS) on isolated schema `gigalibs_procurement`. Sibling organizations cannot inspect cross-unit requisitions or orders. |
| **Audit & Outbox Fidelity** | Immutable audit trail for all approvals, PO revisions, and match events. Transactional outbox for event propagation. |

---

## 3. Architecture & Domain Model

### 3.1 Isolated Database Schema (`gigalibs_procurement`)
Following ADR-0016 and ADR-0022 principles, the module owns its own schema:
- `procurement_requisitions` & `procurement_requisition_lines`
- `purchase_orders` & `purchase_order_lines`
- `purchase_order_revisions` (Historical version snapshot)
- `vendor_bills` & `vendor_bill_lines`
- `match_po_receipt_records` (PO Line $\leftrightarrow$ Inventory Receipt Line)
- `match_po_invoice_records` (PO Line $\leftrightarrow$ Vendor Bill Line)
- `debit_memos` & `debit_memo_lines`
- `approval_policies` & `approval_requests`
- `audit_events` & `outbox_events`

### 3.2 Authority Matrix
- **Vendors & Payment Terms**: Phase 3 (`@gigalibs/contracts/parties`).
- **Items, SKUs & UOM Conversions**: Phase 4 (`@gigalibs/contracts/catalogue`).
- **Goods Receipts & Physical Lots**: Phase 5 (`@gigalibs/contracts/inventory`).
- **Procurement Documents & Matching**: Phase 6 (`modules/universal-procurement`).

---

## 4. Slice Plan (P6-0 through P6-9)

| Slice | Title | Deliverables | Verification Gate |
|---|---|---|---|
| **P6-0** | Architecture ADR-0023 & Threat Model | Author `docs/architecture/ADR-0023-universal-procurement-and-payables-module.md` | Threat model, boundary validation, and invariant sign-off |
| **P6-1** | Public Contracts & Module Registration | `@gigalibs/contracts/procurement` Zod schemas, DTOs, events; register in `modules/universal-procurement/module.yaml` | `pnpm --filter @gigalibs/contracts build` |
| **P6-2** | Forward-Only Migration (`gigalibs_procurement`) | `000001_procurement_foundation.up.sql` with tables, constraints, RLS, immutability triggers | Migration replay in isolated PostgreSQL |
| **P6-3** | Requisitions & Delegation of Authority | Requisition drafting, line items, threshold-based approval routing, DoA policy engine | Unit & integration tests for multi-tier approval rules |
| **P6-4** | Purchase Orders & Revision Management | PO generation from requisitions, direct PO creation, status lifecycle, revision history | State machine verification (DRAFT -> ISSUED -> COMPLETED) |
| **P6-5** | Goods Receipt Integration | Integration with Phase 5 Inventory receipts, receipt line binding, remaining delivery tracking | PO Line quantity consumption tests |
| **P6-6** | 3-Way Matching Engine & Tolerance Guards | PO $\leftrightarrow$ Receipt $\leftrightarrow$ Invoice matching, price/quantity variance calculations, tolerance holds | Mathematical proof: `Invoiced <= Received <= Ordered` |
| **P6-7** | Vendor Bills & Debit Memos | AP bill ingestion, line tax computations, debit memo creation for rejected/damaged goods | Accounting balance verification, minor unit arithmetic |
| **P6-8** | Application Dictionary Adapter & UI | `ProcurementConfigurationAdapterV1`, `<UniversalProcurementWorkspace />` with `<DictionaryRenderer />` | Component compilation & Medusa UI preview |
| **P6-9** | Real PostgreSQL Certification & Audits | Multi-tenant, multi-org test harness (`real-database-proof.ts`), verify all 7 SDLC audits | 100% pass on real PostgreSQL container; `pnpm verify` clean |

---

## 5. Definition of Done

1. Dedicated schema `gigalibs_procurement` isolated with runtime least-privilege role and forced RLS.
2. Full compliance with zero-float monetary arithmetic (minor units) and 6-decimal bounded quantities.
3. 3-Way match verification proven mathematically on live PostgreSQL database.
4. Seamless consumption of Phase 3, 4, and 5 contracts with zero master entity duplication.
5. Application Dictionary metadata embedding certified with Safe AST validation.
6. Real database integration proof passing 10+ end-to-end scenarios.
7. Mandatory SDLC audits (`node scripts/verify.mjs --audits`) passing cleanly with zero new violations.
