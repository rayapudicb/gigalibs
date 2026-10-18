# WI-OI-120bk: W1-B — switch on CMMS unit and site scope (R5)

- **Status:** Approved (owner, 2026-10-18); **Built** in git — `SCOPE_ENFORCING`, catalogue coverage test, journey North/South proof; Security review + owner UAT deploy pending
- **Work item:** WI-OI-120 (Phase 1 W1, step 1.1 second half). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M (one release; no CMMS migration)

## Goal

Unit and place assignments for roles **take effect for CMMS**: a person held to North plant cannot see or change South
plant work orders, stock, requests, or other scoped CMMS records. The journey proves North vs South for a **CMMS-only**
custom role.

## Design (from WI-OI-120be split, HANDOFF-2026-10-18 §4.3)

- Set `'asset-maintenance': { units: true, places: true }` in `SCOPE_ENFORCING_MODULES`
  (`packages/contracts/src/rbac/assignment-scopes.ts`).
- Replace the placeholder test `has no enforcing module until an R5 card proves one` with a test that the **minted CMMS
  session context covers every permission code** the CMMS API checks (per R5 doc and assignment-scopes comment).
- Update tests that pin `{}`: `assignment-scopes.test.ts`, `r5-cmms-role-reconciliation.spec.ts`.
- Built-in maintenance roles still bundle Workforce / Geospatial / maps codes → they **cannot** be held at units until
  those modules are scope-proven; journey uses a **custom role** with CMMS codes only.
- Independent Security review before UAT deploy.

## Scope

- **May change:** `packages/contracts/src/rbac/*`, CMMS auth/scope tests if needed for coverage proof, journey spec
  (North/South CMMS proof step), `.pi` evidence.
- **Must not change:** CMMS import/export files; applied UAT migrations; secrets; unrelated sessions' UI files.

## Done when

- [x] `SCOPE_ENFORCING_MODULES` includes `asset-maintenance` with `units: true`, `places: true`.
- [x] Context-coverage test passes (every CMMS-checked code covered by minted context).
- [x] Journey proves North-scoped CMMS custom role does not see South work orders (git; needs W1-B on UAT to pass live).
- [x] Security review recorded (bundled with **`361f160e`** / release **`8df9960a`**; see [WI-OI-120bi](WI-OI-120bi.md) § migration 22 review).
- [ ] Owner deploy from release worktree; journey North/South scope + sign-off **0 blockers** on UAT; evidence in `.pi/work/WI-OI-120.md`.

## Stop and ask if

- Enabling places before T3 canonical place tree would widen place scope incorrectly;
- Any tenant on UAT would lose access unexpectedly (expect: no unit grants on UAT today per 120be).

## Out of scope (Phase 6 / M-CM2)

Reliability (`/cmms/analytics`), shop-floor kiosk (`/cmms/floor`), EAM depth — see gigaops roadmap § P4b.
