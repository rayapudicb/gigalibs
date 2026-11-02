# WI-OI-150: Labels, help, errors and empty-state words

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P2. **Size:** S. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Labels people use (asset tag, part number) instead of internal ids; no "(minor units)", "ID" or "key" labels; one
sentence of help on every required field (8 windows have none); every module API client shows plain errors; empty
states with purpose, next step and button (27 screens); lower `config/ui-shell-baseline.json` (emoji, developer text,
hand-made tab bars).

## Done when

Label problems in `docs/plans/ux-journeys-screen-inventory.md` at zero; `audit:ui-shell` baseline lowered.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-150.md`; agents do not deploy.
