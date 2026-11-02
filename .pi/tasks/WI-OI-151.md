# WI-OI-151: Playwright journey specs with timings and budgets per persona and module

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P0. **Size:** M. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Extend `e2e/specs/journey-recorder.ts` with per-step timing and budgets; one spec per persona journey in
`docs/plans/ux-journeys-benchmark-plan.md` §5 (27 journeys, every module) on the isolated test stack with seeded
masters; a report (time per step and journey, findings) published to `.pi/work/`; `pnpm e2e:journeys` fails when a
step exceeds its budget or a journey its 10/30-second target. Mobile journeys (Maestro in `gigalibs_mobile`) phase 2.

## Done when

All 27 journeys automated and green against their targets after WI-OI-146–150; the report replaces the
Keystroke-Level estimates in the plan.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-151.md`; agents do not deploy.
