# WI-OI-149: Forms to 10–30 seconds: pickers with auto-fill, defaults, money in normal units, create-from, one-click approvals

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P0/P1. **Size:** M. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Customer/vendor pickers over Business partners with the name filled; product picker fills code, name and base
unit; organization unit and warehouse default from the person; money typed and shown in normal units with the
currency (stored as today); date defaults; quote → order → fulfillment → invoice and PO → receipt → bill create-from;
save-and-new and keyboard order; faster hazard report and triage; one-click approve/reject from lists. Business rules
unchanged except create-from (new, because re-typing a document is not acceptable to the business).

## Done when

Every create journey ≤ 30 s and every approval ≤ 10 s in WI-OI-151; no "(minor units)" entry anywhere.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-149.md`; agents do not deploy.
