# WI-OI-120hk (M-WF2): Time and timesheet on metadata — submit week + approver queue

- **Status:** No code changes needed — blocked by WI-OI-120hj (B1). **2.3 decision (2026-10-24): keep the component.**

## 2.3 decision — M-WF2 stays a component (2026-10-24)

Plan step 2.3 asks for time/timesheet approval "on metadata (the clock-in panel stays a component)". Investigation
(this card) showed the React component `TimeAndAttendance.tsx` already does submit-week + the approver queue and
works once B1 links the person. Rebuilding it as a metadata window hits the **same wall as the Jobs window
(WI-OI-120hm)**: a weekly timesheet is a *computed aggregate* (paired punches, issues, open exceptions) with a
submit→approve/reject lifecycle and four-eyes immutability — not CRUD a metadata window expresses. `module.yaml`
already keeps clock-in and dispatch as components for the same reason. **Decision: time & timesheet approval stays
the `TimeAndAttendance` component; no metadata rebuild.** B2/B4 clear on the B1 deploy, no further code.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

A Workforce member can submit their week for approval from `/gigaops/time`, and a Workforce supervisor
sees all submitted weeks in their approval queue on the same page. Unblocks journey blockers B2 and B4
(Group 5).

## Investigation findings (2026-10-24)

The task was written assuming the "Submit week" button and approver queue were missing. They are not.

**"Submit week" button** exists at `apps/workflow-platform/components/gigaops/TimeAndAttendance.tsx:477`:
```tsx
<Button type="button" className="mt-4" isLoading={busy} disabled={blocked} onClick={() => void submit()}>Submit week</Button>
```
It is inside a `{preview ? (...) : null}` block. `preview` is `null` when `hold === true`, and
`hold === true` when `own === 'no'` — which is what happens when B1 is broken (email stored instead
of UUID, so `platformUserId === session.userId` is false).

**`Approvals` component** exists at `TimeAndAttendance.tsx:484–543`. It fetches
`listTimesheets({ status: 'SUBMITTED' })` and renders each submitted timesheet with an Approve button.

**API endpoints** all exist in `time.controller.ts`:
- `POST /v1/timesheets` — requires `workforce.time.punch` or `workforce.time.manage`
- `GET /v1/timesheets` — requires `workforce.time.punch` or `workforce.time.read`
- `POST /v1/timesheets/:id/approve` — requires `workforce.timesheets.approve`
- `POST /v1/timesheets/:id/reject` — requires `workforce.timesheets.approve`

Routes are in `module.yaml` lines 169–172 and generated into `module-gateways.ts`.

## Why B2 and B4 fail

B2: `preview === null` because `hold === true` because `own === 'no'` because email ≠ UUID (B1).
Once B1 is fixed (UUID stored), `own === 'yes'`, `hold === false`, `preview` loads, button renders.

B4: The approver's `Approvals` component shows rows only when a timesheet has been submitted.
No timesheet is submitted yet (technician hit B2 → couldn't submit). Once B2 is fixed (B1 fixed),
the technician can submit → SUBMITTED row appears → approver sees it.

## Done when

- [x] Investigation complete: all UI and API code exists; no new code needed.
- [ ] WI-OI-120hj (B1) committed and deployed with manifest re-activation.
- [ ] Journey stage 4: `press(technician, /^submit week$/i)` succeeds.
- [ ] Journey stage 6: approver sees the technician's submitted week and can approve it.
- [ ] Evidence recorded in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated.
