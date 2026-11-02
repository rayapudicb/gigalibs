# WI-OI-147 evidence — workspace creation, module enabling, set-up guide

## 2026-11-02 — first slice

- `apps/workflow-platform/components/platform/PlatformTenantControl.tsx`: the workspace address (slug) follows the name
  until the operator edits it, and resets after a create — one field fewer to type (P1).
- `packages/contracts/src/setup/index.ts`: the set-up guide links to the Settings routes (`/settings/general`,
  `/settings/organization`, `/settings/people`, `/settings`, `/settings/plan`) instead of the old `?tab=` URLs.
- Organization delivery: the four modules that never received the organization version now do (WI-OI-146); the
  administrator's "Send to modules again" button (Settings › Organization & hierarchy) redelivers the version in force.

`pnpm verify` PASS (2026-11-02 14:07Z, see WI-OI-146).

## Open (stays in this card)

Module request from Plan & entitlements (A3), one switch per module with an optional reason (P2), starter data on
enable (with WI-OI-148), the per-module delivery state on Settings › Organization, the role permission picker, and P1/P2
journeys (need a platform operator login on the test stack).
