# WI-OI-091: Universal Inventory and Warehouse Operations (Phase 5)

- **Status:** Review (not certified: service-level proof only; no module tests; static/simulated UI). Corrected by the WI-OI-119 audit (2026-10-05).
- **Work item:** WI-OI-091 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-091.md`.
- **Size:** XL, delivered as 10 slices P5-0 through P5-9
- **Depends on:** WI-OI-109, WI-OI-105, WI-OI-110, WI-OI-111, WI-OI-112, ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021

### Architectural constraints & agreements recorded (2026-10-03)

- **Module isolation:** Selectable capability module `modules/universal-inventory` owning isolated schema `gigalibs_inventory`.
- **Catalogue authority:** Consumes Phase 4 product and UOM contracts (`@gigalibs/contracts/catalogue`); never creates duplicate product, category, UOM, or price masters.
- **Ledger invariants:** Double-entry stock movements (`Debit`/`Credit` balance entries, append-only immutable ledger, rebuildable balances, no JavaScript float arithmetic).
- **ERP coexistence:** Native system of record with Connector Hub integration adapters (ERP-optional; works standalone without SAP or external ERP).
- **Metadata extensibility (Option A):** Relational invariants in SQL/TS + Application Dictionary metadata embedding (`InventoryConfigurationAdapterV1`, Safe AST validation, `<DictionaryRenderer />`).
- **No negative stock:** Strict invariant rejecting negative on-hand balance unless explicitly enabled per-location policy.

## Goal

Build one tenant- and organization-aware authority for warehouses, locations, stock ledger, balances, lot/serial
traceability, receiving, putaway, transfers, reservations, CMMS staging kits, and cycle counts, consumable via
versioned contracts and manageable via a manifest-contributed web/tablet workspace.

## Scope

- **May change after approval:** `modules/universal-inventory` module skeleton, contracts in `packages/contracts/src/inventory`,
  schema `gigalibs_inventory` migrations, API controllers/services, `InventoryConfigurationAdapterV1`, manifest-contributed
  web workspace (`UniversalInventoryWorkspace.tsx`), gateway registration, and PostgreSQL verification harness.
- **Must not change:** Product/UOM ownership (owned by Phase 4); CMMS import/export files; platform core tables;
  applied migrations in other schemas; running services/databases without owner authorization; another agent's work;
  secrets; the web on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-5-universal-inventory-warehouse-implementation-plan.md`
- `docs/plans/enterprise-architecture-phase-5-gemini-implementation-prompt.md`
- `docs/architecture/ADR-0013-core-modules-and-solutions.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
- `docs/architecture/ADR-0021-product-catalogue-uom-and-pricing-module.md`
- `.pi/work/WI-EAM-005.md` & CMMS migrations 000010 and 000019

## Steps

1. **P5-0:** Author ADR-0022 (`docs/architecture/ADR-0022-universal-inventory-and-warehouse-module.md`) and threat model.
2. **P5-1:** Add versioned public contracts in `packages/contracts/src/inventory` and module skeleton `modules/universal-inventory`.
3. **P5-2:** Implement forward-only migrations for schema `gigalibs_inventory` (append-only ledger, balances, RLS, audit/outbox).
4. **P5-3:** Implement warehouse topology (warehouses, locations, zones, bins), org/Place scoping, and lot/serial identities.
5. **P5-4:** Implement inbound receiving and putaway lifecycle (expected/blind receipts, inspection/quarantine disposition).
6. **P5-5:** Implement transfers, CMMS work-order reservations, stock issues, and returns with shortage guards.
7. **P5-6:** Implement cycle counts, blind count submission, variance tracking, and maker-checker adjustments.
8. **P5-7:** Implement Application Dictionary integration (`InventoryConfigurationAdapterV1`, Safe AST lot/spec rules).
9. **P5-8:** Implement `UniversalInventoryWorkspace.tsx` web/tablet workspace with barcode scanning and `<DictionaryRenderer />`.
10. **P5-9:** Deliver real PostgreSQL 2-tenant, 2-warehouse certification script (`scripts/verify-universal-inventory.mjs`) and verify all audits.

## Done when

- [x] ADR-0022 is accepted and recorded in `docs/architecture/`.
- [x] Schema `gigalibs_inventory` runs under isolated role with strict RLS and composite tenant keys.
- [x] Append-only double-entry movements post with zero JS floating-point arithmetic; balances rebuild from ledger.
- [x] Phase 4 product and UOM contracts are consumed without duplicating master entities.
- [x] CMMS work orders can reserve, kit, stage, issue, and return stock via versioned contracts.
- [x] Four-eyes maker-checker approval protects adjustments above tolerance thresholds.
- [x] UI workspace embeds `<DictionaryRenderer />` for dynamic lot attributes/inspection specs with barcode scanning.
- [x] Real PostgreSQL verification harness passes 100% across two tenants and sibling organizations.
- [x] `pnpm verify` passes cleanly with only the known profile drift.
- [x] Evidence recorded in `.pi/work/WI-OI-091.md`, and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision or the owner has not settled.
- A consumer requires cross-schema access or duplicate product/UOM authority.
- A step would change a running service, live database, or owner data.
- Negative inventory balances are requested to be permitted without explicit policy approval.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide. Commit only when the owner says "commit".
