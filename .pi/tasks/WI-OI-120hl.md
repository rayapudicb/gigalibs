# WI-OI-120hl (M-WF1 fix): Absence type picker and absence approval queue

- **Status:** No code changes needed — blocked by WI-OI-120hj (B1) + manifest re-activation
- **Work item:** WI-OI-120 (execution plan v3 Phase 2, M-WF1 completion). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

A Workforce member can pick an absence type when creating their own absence, and a Workforce supervisor
sees absence requests from their team in the Absence requests tab. Unblocks journey blockers B3 and B5
(Group 5).

## Investigation findings (2026-10-24)

**`absenceTypeLookup`** at `availability-record-adapters.ts:652` calls `listAbsenceTypes` (returns all
types, no status filter), then `pick()` with `active: type.status === 'ACTIVE'`. New absence types
default to `ACTIVE` in the DB — so they are returned when the resolver is called correctly.

**`wf-my-absences.window.json`** is correct at HEAD: `absence-type-id` is `type: "REFERENCE"` with
`referenceKey: "absence-type-ref"` → `referenceType: "SEARCH_LOOKUP"` → `resolverKey: "wf-absence-types"`.

**Root cause of B3:** the control plane activated the `wf-my-absences` manifest from an older compiled
version where `absence-type-id` was `type: "TEXT"`. The stale manifest renders a plain text field
instead of a LookupInput → the resolver is never called → no options shown. UAT fix: owner republishes
the `wf-my-absences` window in Configuration Studio after deploy (see WI-OI-120hj).

Secondary blocker of B3: `requestOwnAbsence` calls `ownPerson(client, principal)` which queries
`WHERE platform_user_id = UUID`. Because B1 stores email instead of UUID, `ownPerson` returns null →
`notLinked()` error even if a type is selected. B3 fully clears when B1 is fixed AND manifest is re-activated.

**Approver queue (B5):** `absenceAdapter.list()` returns all tenant absences; `wf-absences.window.json`
shows the "Absence requests" tab and the `approve` action (visible when `status === 'REQUESTED'`,
requires `workforce.absences.approve`). No code missing. B5 is empty because the absence was never
created (B3 blocked creation → no row to show).

**Tests already exist** in `availability-record-adapters.spec.ts`:
- Line 561–566: "offers a person the active absence types" — verifies only ACTIVE types are returned.
- Line 390–397: "lists requests waiting for a decision first" — verifies supervisor sees all absences.

## Why B3 and B5 fail

B3: stale compiled manifest (TEXT field) + B1 (email ≠ UUID → ownPerson null).
B5: no absence was created (B3 blocked) → approver queue empty.

Both clear when B1 is fixed, deployed, and both `wf-resources` and `wf-my-absences` windows are
republished in Configuration Studio.

## Done when

- [x] Investigation complete: lookup chain and window JSON are correct; no new code needed.
- [x] Tests confirming correct behaviour already exist in `availability-record-adapters.spec.ts`.
- [ ] WI-OI-120hj (B1) committed and deployed; `wf-my-absences` window republished (manifest fix).
- [ ] Journey stage 4: technician creates absence without "Absence type required" error.
- [ ] Journey stage 6: approver sees and approves the absence.
- [ ] Evidence recorded in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated.
