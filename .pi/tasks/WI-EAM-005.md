# WI-EAM-005: MRO Storeroom Logistics & Universal Workforce Relay

- **Status:** Complete (verified 2026-10-03)
- **Work item:** WI-EAM-005 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-EAM-005.md`.
- **Size:** L
- **Depends on:** WI-EAM-004 (Telemetry & PM Triggers), WI-EAM-003 (Reliability & Job Plans), WI-OI-038 (CMMS Core), WI-OI-068 (Workforce Relay)

## Goal

Achieve enterprise MRO storeroom logistics and craft technician dispatch parity with IBM Maximo & openMAINT:
1. **Multi-Warehouse & Bin Tracking (`cmms_storerooms`, `cmms_part_balances`):** Track spare parts inventory across multiple warehouses, stockrooms, and physical bin locations with reorder points and min levels.
2. **Work Order Stock Issue & Return with TCO Roll-Up:** Issue spare parts directly from specific storeroom bins to Work Orders, auto-deducting balances and rolling up actual material costs into work order Total Cost of Ownership (TCO). Support parts return for unused stock.
3. **ADR-0007 Universal Workforce Relay Dispatch:** Provide seamless craft technician dispatch integration from Work Orders, projecting assigned workforce bookings, schedules, and labour cost roll-up.
4. **MRO Storeroom & Parts UI:** Expand `@gigalibs/cmms-web` with Storeroom management, stock issue/return modal on Work Orders, and live TCO financial roll-up.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/` (db migrations, apps/api, module.yaml, web)
  - `packages/contracts/src/cmms/`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-EAM-005.md`
- **Must not change:**
  - The CMMS import/export baseline files;
  - Another agent's work (`.pi/work/WI-OI-103.md`, `scripts/verify-manufacturing-no-developer.mjs`);
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-01, FR-04, FR-05, FR-08, FR-09, FR-10, FR-12, FR-17)
- `docs/SDLC_DEVELOPMENT_GUIDE.md` (Gate G0–G5 Definition of Done)
- `modules/physical-operations-cmms/apps/api/src/parts/`
- `modules/physical-operations-cmms/apps/api/src/work-orders/`
- `modules/physical-operations-cmms/db/migrations/000011_cmms_workforce_handshake.up.sql`

## Steps

1. **Database Schema Migration (`gigalibs_cmms` - Migration 19):**
   - Create `cmms_storerooms` table: `id`, `tenant_id`, `code`, `name`, `description`, `site_ref`, `is_active`, audit timestamps, forced RLS.
   - Create `cmms_part_balances` table: `id`, `tenant_id`, `part_id`, `storeroom_id`, `bin_location`, `quantity_on_hand`, `min_quantity`, `reorder_point`, composite PK, forced RLS.
   - Alter `stock_movements`: add `storeroom_id` and `bin_location` columns.
   - Update `runtime-manifest.txt` and bump `CMMS_SCHEMA_CONTRACT_VERSION` to 19.
2. **Contracts & API Domain (`@gigalibs/contracts` & `@gigalibs/cmms-api`):**
   - Define V1 schemas for Storerooms CRUD, Storeroom Part Balances, and Work Order Issue/Return actions (`IssueCmmsPartV1Schema`, `ReturnCmmsPartV1Schema`).
   - Implement `PartsService` storerooms CRUD and bin balances methods.
   - Implement Work Order stock issue and return deduction methods with atomic ledger update and TCO roll-up.
3. **Web Experience (`@gigalibs/cmms-web`):**
   - Update `CmmsWorkOrders.tsx` with Storeroom Part Issue/Return modal, live TCO cost breakdown, and craft workforce dispatch panel.
   - Update `CmmsParts.tsx` with Storeroom Bin inventory breakdown.
4. **Verification & Conformance:**
   - Vitest unit tests in `modules/physical-operations-cmms`.
   - Automated certification script `scripts/verify-eam-mro-storerooms-and-tco.mjs`.
   - `pnpm verify --audits` and full workspace verification.

## Done when

- [x] Migration 19 cleanly applies with composite PKs `(tenant_id, id)` and forced RLS.
- [x] Storeroom and bin tracking accurately maintains per-warehouse balances and reorder points.
- [x] Work Order stock issue atomically deducts storeroom bin balances and reflects in stock ledger.
- [x] Work Order Total Cost of Ownership (TCO) computes combined labour and parts costs.
- [x] `scripts/verify-eam-mro-storerooms-and-tco.mjs` passes 100%.
- [x] `pnpm verify --audits` passes with zero audit regressions.
- [x] Evidence recorded in `.pi/work/WI-EAM-005.md` and `.pi/NOW.md` updated.
