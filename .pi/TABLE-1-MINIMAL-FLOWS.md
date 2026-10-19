# Table 1 — minimal P2P and O2C business flows

Reference map: [TABLE-1-IDEMPIERE-MAP.md](TABLE-1-IDEMPIERE-MAP.md) rows **6** (P2P) and **7** (O2C).  
iDempiere is a **functional reference** (document types and outcomes), not copied code (plan D8).

## Minimal P2P (buy side)

| Step | iDempiere-style outcome | GigaLibs API / F0 action |
|------|-------------------------|---------------------------|
| 1 | Internal requisition | Create requisition (window) |
| 2 | Submit / approve | `submit`, `approve` actions |
| 3 | Req → PO | `convert-to-po` action + `POST …/convert-to-po` |
| 4 | PO to vendor | `issue`, `acknowledge` on PO window |
| 5 | Material receipt (stub) | `matchReceipt` (inventory receipt id as proof token until Table 2 GRN) |
| 6 | Vendor invoice + match | Vendor bill window + `matchInvoice` |
| 7 | AP ready bill | `approve` on vendor bill |

**Evidence:** `pnpm proof:minimal-p2p` in `@gigalibs/universal-procurement-api`.  
**Not in minimal scope:** GL/AP posting (Table 2), spend/budget (row 16), full inventory receipt UI.

## Minimal O2C (sell side)

| Step | iDempiere-style outcome | GigaLibs API / F0 action |
|------|-------------------------|---------------------------|
| 1 | Sales quotation | Quote window |
| 2 | Customer acceptance | `accept` action |
| 3 | Quote → order | `convert` action (warehouse parameter) |
| 4 | Firm order | `confirm` on sales order |
| 5 | Reserve / pick | `allocateOrderLine` (API; window slice later) |
| 6 | Shipment record | Fulfillment window create (updates shipped qty) |
| 7 | Customer invoice | `issue-invoice` action on sales order |

**Evidence:** `pnpm proof:minimal-o2c` in `@gigalibs/universal-orders-api`.  
**Not in minimal scope:** AR module on compose (M-AR0), dispatch with inventory `issueId`, payments/cash application (row 10).

## Work item

Implementation card: **WI-OI-120gt** (minimal flow APIs, F0 actions, proof scripts).
