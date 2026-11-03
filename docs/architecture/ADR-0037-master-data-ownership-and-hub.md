# ADR-0037: Master data ownership, overlapping masters and the master data hub

- **Status:** Accepted by the owner, 2026-11-03 ("go with your recommendations"; decisions 1 and 5 of
  `docs/plans/master-data-and-platform-architecture-analysis.md` §9). Independent Architecture review pending.
- **Date:** 2026-11-03
- **Work items:** WI-OI-152 (hub), WI-OI-157 (reconciliation)
- **Builds on:** ADR-0018 (organization hierarchy), ADR-0003 (identity and workforce primitives), ADR-0016 (module
  boundaries).

## Context

- Every master has one owning module (correct), but four concepts are stored more than once without links (analysis
  §3.6): locations (org units, Geospatial places, CMMS spaces, Inventory locations), physical assets (CMMS assets,
  General ledger fixed assets), exchange rates (four tables) and people (users, Workforce resources, person parties).
- Masters are spread over Operations, Finance and Settings with no place to see them together; personas are coarse.

## Decision

1. **Canonical owners.**
   - **Physical locations:** Geospatial places are the master for sites, buildings, zones and areas. Organization units
     say who owns and approves (ADR-0018) and link to places. CMMS spaces and Inventory warehouses and locations keep
     their operational detail and carry a `place_id` link.
   - **Physical assets:** the CMMS asset is the physical asset. A General ledger fixed asset links to it
     (`cmms_asset_id`) for book value and depreciation; neither copies the other's fields.
   - **Exchange rates:** one owner, the kernel's tenant rate store (`public.tenant_exchange_rates` with the platform
     rate feed `public.currency_exchange_rates`); modules read rates, never keep their own (consolidation rates become
     a read of the owner at the consolidation date).
   - **People:** a person party is the master person record. A login (user/member) and a Workforce resource link to it
     (`party_id`); names and contact details live on the party.
   - **Stock (amendment, owner 2026-11-03):** Universal Inventory owns every stock quantity and movement (balances,
     reservations, issues, returns, receipts). CMMS spare parts stop keeping their own balances and movements: a work
     order reserves and issues parts from Inventory, and CMMS keeps what is its own — which part fits which asset
     (spares lists and diagrams) and the parts used on each work order. Found in the review of the mobile capability
     atlas: CMMS storerooms and part balances run next to the Inventory ledger today.
2. **Three levels of master data** (with ADR-0038): platform reference data (kernel, read-only), pack-provided data
   (copied into the workspace on creation, editable) and module masters (created by the workspace).
3. **Master data hub.** Each module declares its masters in `module.yaml` (`spec.masters`); a generated registry drives
   a **"Master data" area of its own in the sidebar** for administrators (tenant admins, platform operators,
   operations supervisors), listing every master the person may read with counts, health, import/export and pack
   updates. Each master stays reachable from its module.

## Consequences

- Links are added, never merges of tables; each slice is additive with a backfill (WI-OI-157).
- Stock is the exception that moves data: CMMS part balances are reconciled into Inventory once, then CMMS reads and
  writes stock through Inventory (WI-OI-157 slice 5); until then no mobile work-parts flow is switched on.
- Reports can join location, asset and person across modules through the links.
- The hub is generated, so a new module's masters appear without hand-written navigation.

## Alternatives considered

- One shared master data schema (iDempiere style): rejected — breaks module isolation and row-level security per module.
- Leaving overlaps as they are: rejected — the same site, asset or person would be entered and reported several times.
