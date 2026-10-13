# WI-OI-120af: The conversion check compares record permissions with the module's REST routes

- **Status:** Carded, not started (owner, 2026-10-13: "card I3/I4"). Shown to the owner before it starts.
- **Found by:** the independent Security review of WI-OI-120u Slices 1–2 (finding I4, informational). It is why M1
  (Workforce positions under the job profiles' permissions) passed S16.
- **Work item:** WI-OI-120 (S16 follow-up). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Why

`scripts/verify-module-conversion.mjs` (S16) compares a module's windows with its record dispatcher, gateway, pages
and module roles. Two things it does not check:

- **Record permissions against REST.** It never compares a record type's read, create and update permissions, or an
  action's permission, with the permission the module's REST route requires for the same operation. A record API
  wider than REST passes. The record routes reach the dispatcher through a gateway gated only at the module's read
  permission.
- **Record types without a window.** A record type registered by the dispatcher but shown by no window (for example
  Workforce's held-back job profiles and positions) is not checked at all, though the record API serves it.

## Design (to be confirmed with the owner)

1. Each record adapter names the REST route of each operation it mirrors, or states that there is none. Each such
   route's permission comes from the module manifest's gateway routes or the controllers' metadata.
2. The check fails when a record permission does not hold at least what the matching REST route requires.
3. The check fails for a registered record type with no window, unless it is listed as held back with its card.
4. Tests in `packages/configuration-core/src/conversion-check.test.ts` with a deliberately wider adapter.
5. Run it over every converted module and fix or card any gaps found.

## Scope

- **May change:** `scripts/lib/conversion-check.mjs`, `scripts/verify-module-conversion.mjs`, the module SDK's
  adapter description (`describe()`), and module adapters to name their REST routes.
- **Must not change:** module behaviour beyond permission fixes the owner approves.

## Done when

- [ ] S16 fails a record or action permission wider than its REST route, and an unlisted record type with no window.
- [ ] All converted modules pass, or each gap is carded.
- [ ] Tests and evidence recorded.
