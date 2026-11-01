# WI-OI-136: M-BOM Visual exploded diagrams and spares (CMMS extension, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-136. Evidence: `.pi/work/WI-OI-136.md`. Spec: `docs/products/mobile-suite/12-visual-exploded-bom-spares.md`;
  plan §3 (governed diagram revisions, hotspot-to-part mapping, WO linkage, low-stock policy; live stock marked with
  freshness; reservation idempotent with available quantity and WO reference).
- **Size:** L

## Goal

A planner publishes an exploded diagram of an asset with numbered hotspots bound to spare parts; a technician opens it,
taps a part, sees live stock and bin, and reserves it to their work order; issuing the part consumes the reservation.

## Ownership record

- **Writer:** CMMS. Reconciliation: CMMS already owns MRO spares (`parts`, `cmms_part_balances` per storeroom and bin,
  `stock_movements`, issue/return to work orders). It has no diagrams and no reservations. Universal Inventory also
  holds stock with ATP and reservations for business inventory; moving MRO spares there is an owner architecture
  decision, not made here.
- **Data (CMMS migration 29, additive):** `asset_diagrams` (revision per asset and diagram code; DRAFT → PUBLISHED by a
  user who wrote none of it; one published and one draft per code; raster image PNG/JPEG/WebP, at most 700 KB, checked
  by magic bytes and stored with its SHA-256 — no SVG, which can carry script); `asset_diagram_hotspots` (callout, part,
  quantity per assembly, normalised position); `part_reservations` (client operation id, part, work order, quantity,
  OPEN → ISSUED or RELEASED). Forced tenant RLS.
- **Rules:** available = on hand − open reservations, computed under a part row lock; a reservation larger than
  available is refused; a reservation that leaves available at or below the reorder point (or minimum) is flagged
  and emits `CMMS_PART_LOW_STOCK` for procurement consumers; issuing to a work order closes that work order's open
  reservations for the part, oldest first; closed work orders refuse reservations. Hotspots change only on drafts.
- **Permissions:** `cmms.bom.read|manage|publish`, `cmms.parts.reserve`. Technician bom read + reserve; planner bom
  read/manage/publish + reserve; viewer bom read.
- **Mobile:** `/mobile/v1/spares/...` (resolve an asset tag, diagrams, diagram with live stock, image, the asset's open
  work orders, reserve); feature `spares`.

## Gates

Large drawings, PDF and CAD need object storage (the 700 KB raster cap is the interim); pinch-to-zoom fidelity and
device proof; offline persistence; procurement consumption of `CMMS_PART_LOW_STOCK`; the MRO-versus-Universal-Inventory
ownership decision; owner UAT.
