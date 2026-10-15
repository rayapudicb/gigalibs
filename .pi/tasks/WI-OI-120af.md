# WI-OI-120af: The conversion check compares record permissions with the module's REST routes

- **Status:** Built and verified locally (2026-10-15); owner approved plan v3 step 0.5 "as recommended".
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

- [x] S16 fails a record or action permission wider than its REST route, and an unlisted record type with no window.
- [x] All converted modules pass, or each gap is carded.
- [ ] Tests and evidence recorded.

## Built (2026-10-15)

- **Module SDK:**
  - `RecordAdapter.rest` (`RecordRestMirror`) names, per operation, the gateway route it mirrors (`METHOD path`), or
    null when no REST route does the same;
  - `describe()` passes it on;
  - `permissions.read` may list several permissions, all required, and the dispatcher enforces each one.
- **The check** (`scripts/lib/conversion-check.mjs`):
  - **Rule 8:** every operation (read, create, update, each action) names its route or null; the route must be one
    the manifest's gateway declares; and the record permission must hold what the route asks. A route given a list
    accepts any one of them, as the web gateway does (`signed-module-proxy.ts`).
  - **Rule 9:** every record type the dispatcher serves is shown by a window, or is held back with its card; a stale
    held-back entry fails.
  - Held back (`scripts/verify-module-conversion.mjs`): Workforce `wf.job-profiles` and `wf.positions` until the
    Jobs & positions window (WI-OI-120u, plan v3 step 2.1). Their permissions are still compared.
- **All 55 record types in the five converted modules name their routes.** Catalogue 11, Inventory 8, Finance 7,
  CMMS 18, Workforce 11.
- **Judgement calls, each commented at the adapter:**
  - an Inventory receipt line maps to `POST v1/receipts`, because REST adds lines with the receipt;
  - Finance journal drafts and their lines map to `POST v1/journals`, the same act of recording a journal;
  - draft approve and return are null: maker-checker, which REST does not have;
  - Workforce My absences is null for read, create and cancel: self-service on the caller's own absences, with no
    REST route.
- **One gap made visible and fixed in place:**
  - `wf.resource-skills` declared only `workforce.capabilities.read`, and checked `workforce.resources.read` inside
    its `list` (earlier review L1), so the check could not see it.
  - It now declares both, the dispatcher enforces them, and the inline check is gone. The L1 test still passes.
  - No access changes.
- **Result:** all five modules pass. No record permission is wider than its REST route.
- **Proof on the real Workforce description:**
  - putting the original WI-OI-120u M1 bug back (positions under the job-profile permissions) fails read, create and
    update;
  - declaring skills without `resources.read` fails the read.
- **Tests:** `conversion-check.test.ts` 17/17, with new cases for:
  - no `rest`, or an operation without a route;
  - null accepted;
  - an undeclared route;
  - a wider permission, for create and for an action;
  - several read permissions;
  - an any-of route list;
  - an unshown record type, held back or not;
  - stale held-back entries.
- **Verification:**
  - type-checks clean: module SDK, configuration-core and the five modules;
  - 696 tests pass across them (91 files);
  - the five modules rebuilt and the conversion check passes;
  - lint as at HEAD on every touched file, except the check's test file, which gains non-null assertions and
    `delete` in its existing style.

