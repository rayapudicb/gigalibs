# WI-OI-148: Masters and prerequisites: no dead ends, starter data, import, prerequisite checklists

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P1. **Size:** M. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Every empty list explains itself and names the master it needs; every required picker offers "Add new" (8 lack
`createWith` today); enabling a module offers starter masters (units, absence types, calendars, classifications, work
order types, a default warehouse) via configuration packs; CSV/Excel import for warehouses, assets, people, customers
and vendors; each module's Overview lists its prerequisites with their state.

## Done when

Each module usable within 10 minutes of being enabled by the workspace admin alone (WI-OI-151 first-use specs);
no journey blocked by a missing master.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-148.md`; agents do not deploy.
