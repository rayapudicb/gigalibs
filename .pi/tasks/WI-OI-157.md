# WI-OI-157: Overlapping masters reconciled — places, assets, exchange rates, people

- **Status:** Proposed — approved in the execution plan (owner, 2026-11-03); confirm this card with the owner before it starts. Phase 2; needs WI-OI-156 B/C.
- **Work item:** WI-OI-157. Evidence goes in `.pi/work/WI-OI-157.md`.
- **Size:** L, four slices. **Decisions:** ADR-0037 §1.

## Goal

The same site, asset, exchange rate or person is entered once and every module links to it, so reports join maintenance,
stock, finance and people without double entry.

## Scope

- **May change:** additive link columns, pickers and backfills: organization units and Geospatial places, CMMS spaces and
  Inventory locations (`place_id`); General ledger fixed assets (`cmms_asset_id`); Workforce resources and members
  (`party_id`); consolidation reading rates from the rate owner; conversions for the retired rate tables; tests.
- **Must not change:** existing rows' meaning; no table is merged or dropped in this card. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0037; analysis §3.6; ADR-0018; the Geospatial, CMMS spaces, Inventory locations and fixed asset schemas.

## Steps

1. Places: link organization units, CMMS spaces and Inventory locations to a place; backfill by matching codes and list
   the unmatched for the administrator to link.
2. Assets: fixed asset ↔ CMMS asset link with a picker; each screen shows the other side read-only.
3. Exchange rates: consolidation and modules read rates from the owner at a date; the other rate tables become
   read-through with a conversion, retired in a later card.
4. People: person party created when a member is invited or a resource is created; links backfilled.

## Done when

- [ ] Every link exists and is validated through the reference replicas (WI-OI-156)
- [ ] One report joins an asset to its fixed asset and a stock location to its site
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-157.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a backfill cannot match records without guessing.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
