# WI-OI-120hj (T1a): Workforce person-login link on sign-up

- **Status:** Built (uncommitted — awaiting "commit" from owner)
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.2). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

After a user accepts an invitation and the administrator adds them on People (linked to their login),
the `/gigaops/time` clock-in page recognises the link and does not show "not linked to a Workforce
person". Unblocks journey blocker B1 (Group 5).

## Root cause (2026-10-24)

The control plane compiled and activated the `wf-resources` window's manifest from an older version
where the `platform-user-id` field was `type: "TEXT"`, not `type: "REFERENCE"`. The current source
(`modules/gigaops/dictionary/wf-resources.window.json`) is correct (REFERENCE/LookupInput), but the
control plane does not auto-reactivate on deploy — the admin must republish manually in Configuration
Studio. Because the stale manifest rendered a plain text input, the administrator typed the user's
email address, which was stored as `platform_user_id` in `gigalibs_workforce.workforce_resources`.

`ownWorker()` queries `WHERE platform_user_id = $2` with `$2 = principal.subject` (a UUID). Since
the DB holds an email, no row is returned → `requireWorker([])` returns `WORKFORCE_NOT_A_WORKER` →
403 thrown → clock-in fails and the page shows "not linked".

Downstream effects (all unblock when B1 is fixed):
- **B2** (`TimeAndAttendance.tsx`): `platformUserId === session.userId` → `email !== UUID` → `own === 'no'`
  → `hold === true` → `preview === null` → "Submit week" button not rendered.
- **B3** (`requestOwnAbsence`): calls `ownPerson()` → `WHERE platform_user_id = UUID` → null →
  `notLinked()` error. Also requires `wf-my-absences` manifest re-activation (see WI-OI-120hl).
- **B4, B5:** downstream of B2 / B3 respectively.

## Code changes (2026-10-24, uncommitted)

Changed files: `time.rules.ts`, `time.rules.spec.ts`, `time.service.ts` (gigaops-api only).

**`time.rules.ts`** (lines 148–159): extracted `requireWorker` pure function with `WorkerRow` and
`WorkerResult` types. Returns `{ ok: true; id; display_name }` for an active HUMAN, or
`{ ok: false; code: 'WORKFORCE_NOT_A_WORKER' | 'WORKFORCE_WORKER_INACTIVE' }`.

**`time.rules.spec.ts`** (lines 118–134): 4 new unit tests — active human → ok; empty rows →
NOT_A_WORKER; inactive → WORKER_INACTIVE; non-human (EQUIPMENT) → WORKER_INACTIVE.

**`time.service.ts`** (lines 607–619): `ownWorker()` refactored to use `requireWorker`. Error
message: "Your user is not linked to a Workforce person; ask an administrator to link it."

**343 tests pass. TypeScript builds clean.**

## UAT fix (owner must do after deploy)

1. Deploy the current branch.
2. In Configuration Studio → `wf-resources` window → **Republish** (activates the `platform-user-id`
   REFERENCE field so LookupInput shows workspace members instead of a text box).
3. In Configuration Studio → `wf-my-absences` window → **Republish** (activates the
   `absence-type-id` REFERENCE field — see WI-OI-120hl).
4. Delete the test Workforce person that has an email as `platform_user_id`; re-create using the
   LookupInput so the UUID is stored.

## Done when

- [x] `requireWorker` pure function extracted to `time.rules.ts` — 4 unit tests cover all 3 outcomes.
- [x] `ownWorker()` in `time.service.ts` uses `requireWorker`; error message is user-facing.
- [x] 343 tests pass; TypeScript build clean.
- [ ] Committed (owner says "commit").
- [ ] Owner republishes `wf-resources` and `wf-my-absences` windows in Configuration Studio after deploy.
- [ ] Journey stage 4 clock-in step passes without "not linked" error (after manifest re-activation).
- [ ] Evidence recorded in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated.
