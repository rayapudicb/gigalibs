# WI-OI-147: Workspace creation, module enabling and request, set-up guide, organization delivery, role permissions

- **Status:** Ready (owner request 2026-11-02: "review all the business and user persona flows … every screen … e2e
  testing … calculate the journeys … make it super easy … hand over to Cursor").
- **Priority:** P0/P1. **Size:** M. **Plan:** `docs/plans/ux-journeys-benchmark-plan.md`; every screen:
  `docs/plans/ux-journeys-screen-inventory.md`; brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.

## Scope

Platform Control Tower: create a workspace from name and owner email (slug, region, tier, trial defaulted; audit
reason prefilled); enable a module with one switch and a confirm (reason optional), offering its starter data.
Plan & entitlements: a Request button per module. Set-up guide: links to the Settings routes, shown on Home for admins
until done. Settings › Organization: delivery state per module and "Send to modules". Custom roles: pick permissions
from plain-named lists instead of typing codes.

## Done when

Journeys P1 ≤ 15 s, P2 ≤ 10 s, A3 possible for a workspace admin; the set-up guide reaches done from Home without
help; WI-OI-151 specs prove it.

## Rules

No business-logic change unless the business need is not met (say why in the evidence); keep the WI-OI-145 design
(shell tab bar, no page headings, underline tabs, `ModulePage`, plain words, `audit:ui-shell`); `pnpm verify` green;
evidence with before/after timings in `.pi/work/WI-OI-147.md`; agents do not deploy.
