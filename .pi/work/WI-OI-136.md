# WI-OI-136 evidence: M-BOM visual exploded diagrams and spares

Card: `.pi/tasks/WI-OI-136.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — backend, admin web, mobile BFF and mobile app

**Ownership.** CMMS writes everything; it already owns MRO spares (`parts`, per-storeroom `cmms_part_balances`,
`stock_movements`, issue/return to work orders) and had no diagrams or reservations. Moving MRO spares to Universal
Inventory is left to the owner (gate).

**Contracts** (`packages/contracts/src/cmms/spares.ts`): diagram create/update/revise/publish, hotspots, raster image
sniffing (PNG/JPEG/WebP magic bytes, 700 KB), part availability (on hand, reserved, available, stock state, bins,
`asOf`), consumption, reservations. Mobile problem `MOBILE_SPARES_CONFLICT`.

**CMMS migration 29** (`000029_asset_diagrams_part_reservations`): `asset_diagrams` (revision per asset and code, one
draft and one published, four eyes, raster types only, size bound), `asset_diagram_hotspots` (callout, part, quantity,
normalised position), `part_reservations` (unique operation, OPEN → ISSUED/RELEASED shape). Forced tenant RLS. Pins
28 → 29. Proof `db/proofs/000029_asset_diagrams_part_reservations.sql` on disposable PostgreSQL 16 (non-superuser,
non-owner, rolled back): second draft refused, SVG type refused, self-publication refused, hotspot outside the drawing
refused, duplicate operation and zero quantity refused, release without reason refused, a part with reservations cannot
be deleted, tenant isolation. Down to 28 while empty, up to 29; proofs 27, 28, 29 pass together.

**Service.** Diagrams: create (image decoded and checked), revise (new draft with image and hotspots), update and
hotspots (drafts only, parts must be visible), publish (never the author or last editor; supersedes the previous
revision), detail with live availability, image, 12-month consumption per callout. Reservations: replay by operation id,
work order locked and open, part locked, refused above available (`CMMS_PART_SHORT`), low stock flagged with a
`CMMS_PART_LOW_STOCK` outbox event; release with reason; per-work-order list; open work orders per asset. The existing
issue flow now fulfils the work order's open reservations for the part, oldest first, in the same transaction.
Real-PostgreSQL test (`spares.pg.test.ts`) 7/7, with commissioning 8 and calibration 10 still passing (25/25). Compiled
`AppModule` loads.

**Manifest**: `cmms.bom.read|manage|publish`, `cmms.parts.reserve` (technician read + reserve; planner read, manage,
publish, reserve; viewer read); 10 gateway routes; `/cmms/spares`. **Web**: Visual spares — asset picker, diagrams,
drawing with stock-coloured hotspots, part panel (bins, freshness, 12-month issues, reserve to an open work order),
draft hotspot editor (click to place), publish and new revision. `next build` passes; design-token audit clean.

**Mobile BFF**: spares adapter (tag resolve as a body, diagrams, open work orders, detail, image, reserve) on the
shared CMMS forwarder; web `/mobile/v1` allowlist; session grant of module `spares` (`cmms.bom.read`, plus
`cmms.parts.reserve` when held).

**Mobile app**: contracts mirror, API adapter (answers must belong to the request), feature
`@gigalibs/mobile-feature-spares` (scan an asset tag, its published diagrams, drawing with glove-sized hotspot targets,
part card with stock freshness, reserve to an open work order with resend on a lost answer), routes `/spares`,
`/spares/[assetId]`, `/spares/diagram/[diagramId]`; reuses the tagging capability pack.

**Tests and gates**: platform targeted suites (web/CMMS/contracts 1,032; auth-nest mobile and BFF 46); mobile lint,
typecheck, 1,948 tests, profiles, architecture.

**Gates still open**: large drawings, PDF and CAD need object storage; pinch-to-zoom and device proof; offline
persistence; procurement consumer of `CMMS_PART_LOW_STOCK`; MRO ownership decision; owner UAT.

**Module gate (2026-11-02).** `pnpm verify`: everything passes except the test step's four known pre-existing suites;
14 optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-01T18-52-35-065Z.log`. The synthetic
worst signed-context configuration is now 15,740 characters (refused at minting with a reason; realistic members pass);
the platform decision in WI-OI-134 remains open.
