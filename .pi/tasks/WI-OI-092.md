# WI-OI-092: Universal Procurement, Vendor Operations and 3-Way Matching (Phase 6)

- **Status:** Complete (Implemented, certified with real database proof, and SDLC audits verified 2026-10-04)
- **Work item:** WI-OI-092 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-092.md`.
- **Size:** XL, delivered across 10 slices P6-0 through P6-9
- **Depends on:** WI-OI-109, WI-OI-110, WI-OI-111, WI-OI-112, WI-OI-091, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022

### Architectural constraints & agreements recorded (2026-10-04)

- **Module isolation:** Selectable capability module `modules/universal-procurement` owning isolated schema `gigalibs_procurement`.
- **Zero master duplication:** Consumes Phase 3 Core Parties for suppliers/vendors and Phase 4 Product Catalogue for items/prices; never creates duplicate supplier or product tables.
- **Goods Receipt authority:** Consumes Phase 5 Universal Inventory `receipts` and `receipt_lines` via versioned contracts; never duplicates receiving records.
- **3-Way matching invariant:** Mathematical verification: `Invoiced Qty <= Received Qty <= Ordered Qty`.
- **Zero JS float arithmetic:** All money amounts stored as exact integer minor units (cents) or BigInt-safe strings; quantities bounded to 6 decimal places.
- **Metadata extensibility (Option A):** Core transactional integrity in PostgreSQL + Application Dictionary metadata embedding (`ProcurementConfigurationAdapterV1`, Safe AST validation, `<DictionaryRenderer />`).
- **Variance tolerance engine:** Automated price variance detection (< 1% auto-cleared; >= 1% requires maker-checker authorization).

## Goal

Build one tenant- and organization-aware authority for requisitions, approval chains (Delegation of Authority), purchase orders, 3-way matching against inventory goods receipts, vendor AP bills, and debit memos, consumable via versioned contracts and manageable via a manifest-contributed web/tablet workspace.

## Scope

- **May change after approval:** `modules/universal-procurement` module skeleton, contracts in `packages/contracts/src/procurement`, schema `gigalibs_procurement` migrations, API controllers/services, `ProcurementConfigurationAdapterV1`, manifest-contributed web workspace (`UniversalProcurementWorkspace.tsx`), gateway registration, and PostgreSQL verification harness.
- **Must not change:** Never, on any card:
  - Phase 3 Party master ownership (`@gigalibs/contracts/parties`);
  - Phase 4 Product/UOM master ownership (`@gigalibs/contracts/catalogue`);
  - Phase 5 Universal Inventory ledger and receiving ownership (`@gigalibs/contracts/inventory`);
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-6-universal-procurement-payables-implementation-plan.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
- `docs/architecture/ADR-0020-core-parties-reference-adoption-and-bounded-custom-apps.md`
- `docs/architecture/ADR-0021-product-catalogue-uom-and-pricing-module.md`
- `docs/architecture/ADR-0022-universal-inventory-and-warehouse-module.md`

## Steps

1. **P6-0:** Author ADR-0023 (`docs/architecture/ADR-0023-universal-procurement-and-payables-module.md`) and threat model. [DONE]
2. **P6-1:** Add versioned public contracts in `packages/contracts/src/procurement` and module skeleton `modules/universal-procurement`. [DONE]
3. **P6-2:** Implement forward-only migrations for schema `gigalibs_procurement` (requisitions, orders, matches, bills, RLS, audit/outbox). [DONE]
4. **P6-3:** Implement purchase requisitions and Delegation of Authority (DoA) threshold-based approval routing. [DONE]
5. **P6-4:** Implement purchase order lifecycle, line item pricing, revision tracking, and supplier confirmations. [DONE]
6. **P6-5:** Integrate with Phase 5 Universal Inventory goods receipts (`match_po_receipt_records`). [DONE]
7. **P6-6:** Implement 3-way matching engine (`Invoiced <= Received <= Ordered`) and price variance tolerance controls. [DONE]
8. **P6-7:** Implement vendor AP bills, debit memos, and accrual clearing logic in integer minor units. [DONE]
9. **P6-8:** Implement Application Dictionary integration (`ProcurementConfigurationAdapterV1`) and `<UniversalProcurementWorkspace />`. [DONE]
10. **P6-9:** Deliver real PostgreSQL multi-tenant certification harness (`real-database-proof.ts`) and verify all SDLC audits. [DONE]

## Done when

- [x] ADR-0023 is accepted and recorded in `docs/architecture/`.
- [x] Schema `gigalibs_procurement` runs under isolated role with strict RLS and composite tenant keys.
- [x] 3-Way match invariant is mathematically proven across POs, inventory receipts, and vendor bills.
- [x] Phase 3 Parties, Phase 4 Products, and Phase 5 Inventory contracts are consumed without duplicate master tables.
- [x] Multi-tier approval thresholds enforce Delegation of Authority before purchase orders are issued.
- [x] Price variances exceeding tolerance trigger payment holds and require documented authorization.
- [x] UI workspace embeds `<DictionaryRenderer />` for dynamic vendor qualification and purchase requisition fields.
- [x] Real PostgreSQL certification harness passes 100% across two tenants and sibling organizations.
- [x] `pnpm verify` passes cleanly with only the known profile drift.
- [x] Evidence recorded in `.pi/work/WI-OI-092.md`, and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision or the owner has not settled.
- A consumer requires cross-schema access or duplicate supplier/product/inventory authority.
- A step would change a running service, live database, or owner data.
- Tolerance logic is requested to permit payments above approved amounts without managerial override.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide. Commit only when the owner says "commit".
