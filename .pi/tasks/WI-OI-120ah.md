# WI-OI-120ah: Retire the demo Time & Attendance screen; Time goes to the real punch screen

- **Status:** Carded, not started (owner, 2026-10-13: "commit, a"). Shown to the owner before it starts.
- **Found by:** the WI-OI-120u Workforce journey on UAT (run `6luh84`, release `4b8db72eae10-c90a7bebc734`).
- **Work item:** WI-OI-120 (U20a neighbour). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Why

- The sidebar's **Time & Attendance** entry (`modules/gigaops/module.yaml`, `/gigaops/time`) opens `PlantOperationsHub`
  (`apps/workflow-platform/components/gigaops/PlantOperationsHub.tsx`, since c104dbf, 2026-09-28).
- That screen is **hard-coded demo data**:
  - 911 lines of in-memory state (`INITIAL_SHIFTS`, `INITIAL_INSPECTIONS`, `INITIAL_HANDOVER`) and no API call;
  - 16 invented people and places ("Samalkot Plant", "Ramana Rao", "Suresh Kumar" and others);
  - a fixed "ON DUTY / Tap to Clock Out" card and a static muster board;
  - its buttons change only local state.

  AGENTS.md forbids production-reachable mock data and local-only business persistence.
- The real punch and timesheet screen is the workbench's **Clock & timesheets** section (`/gigaops/attendance`,
  `TimeAndAttendance.tsx`). It handles punches, the week's timesheet, submit, approve and reject, corrections and
  exceptions, all through the Workforce API. No sidebar entry reaches it.
- The journey therefore fails the technician's clock-in and week and the approver's week approval. It looks for them
  on `/gigaops/time`.

## Design (to be confirmed with the owner)

1. `/gigaops/time` draws the real `TimeAndAttendance`; the sidebar's Time & Attendance entry stays where it is.
   `/gigaops/attendance` stays as an alias, or redirects to `/gigaops/time`.
2. `PlantOperationsHub.tsx` is deleted. Its other tabs (Shift roster, Operator rounds, Shift handover log) are demo
   data too, and are listed with Slice 3 (U20a), to adopt with a real service or retire.
3. The journey's clock-in, submit-week and week-approval steps run against the real screen.
4. A guard: a test fails if a Workforce screen ships the demo names or in-memory "initial" fixtures (an addition to
   the runtime-data audit, `scripts/verify-runtime-data-integrity.mjs`).

## Scope

- **May change:** `apps/workflow-platform/components/gigaops/` (workbench sections, `PlantOperationsHub.tsx` removal),
  `modules/gigaops/module.yaml` (menu, if needed), the journey spec, the runtime-data audit.
- **Must not change:** the Workforce API and its time services, other agents' work.

## Done when

- [ ] No Workforce screen shows hard-coded demo data; the guard fails if one comes back.
- [ ] The sidebar's Time & Attendance opens the real punch and timesheet screen.
- [ ] The journey's clock-in, week and approval steps pass on UAT, or each remaining gap is reported.
- [ ] Evidence recorded; built and handed to the owner as a release.
