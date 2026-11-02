# WI-OI-146: Unblock every screen: service, data and lookup faults

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P0. **Size:** S. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Every screen of the 2026-11-02 benchmark loads its data: Procurement and Orders records (404), Inventory records
and lookups (500/404), Business partners sort (400), Inspection rounds organization delivery (503), Geospatial and
Workflow Studio absence (502: deploy or degrade), Settings › Security JSON bug, Settings › General manifest (404),
Analytics permissions for the workspace admin (403), the four screens that never settle, and customer/vendor typed as a
party UUID on documents (pickers instead).

## Done when

0 failing calls and 0 error states on the 128 benchmark screens (`e2e/ux-benchmark/bench.mjs`), except intentional
permission notes; journeys A2, A4, A6, T2, B1–B4, C1, C2 no longer blocked.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-146.md`; agents do not deploy.
