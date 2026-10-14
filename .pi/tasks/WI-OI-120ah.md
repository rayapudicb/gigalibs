# WI-OI-120ah: Retire the demo Time & Attendance screen; Time goes to the real punch screen

- **Status:** Built and verified locally, not committed (2026-10-14; owner: "commit, approve 120ah"). Next: the owner's
  "commit", then the release build, an independent Security review, the owner's deploy and the journey.
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

## Design (approved by the owner, 2026-10-14)

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

- [x] No Workforce screen shows hard-coded demo data; the guard fails if one comes back.
- [x] The sidebar's Time & Attendance opens the real punch and timesheet screen.
- [ ] The journey's clock-in, week and approval steps pass on UAT, or each remaining gap is reported.
- [ ] Evidence recorded; built and handed to the owner as a release. (Evidence recorded; the release is next.)

## What was built (2026-10-14)

- **One Time screen.** `/gigaops/time` draws `TimeAndAttendance` (label "Time & attendance"). `attendance` is no longer
  a section; `/gigaops/attendance` redirects to `/gigaops/time`. `PlantOperationsHub.tsx` (911 lines) is deleted, with
  its Shift roster, Operator rounds and Shift handover tabs: they were demo data with no service. A real need for any of
  them is a new card.
- **The guard** (`scripts/verify-runtime-data-integrity.mjs`), in both audit modes:
  - `IN_MEMORY_BUSINESS_FIXTURE`: an `INITIAL_`, `DEMO_`, `SAMPLE_` or `SEED_` constant holding an array of objects,
    under the Workforce screens, routes and module (`paths`, a new optional rule field);
  - `FABRICATED_PEOPLE_OR_PLACES`: the demo screen's invented people and plant, anywhere.
  - Proof: HEAD (which still has the demo screen) plus the new rules fails with 2 fixtures and 18 invented names, all in
    `PlantOperationsHub.tsx`; with the screen removed, both modes pass.
  - Widening the fixture rule to every module is WI-OI-120ak's.
- **Plan v3 step 0.8 item (journey `7i0v43`):** an administrator with no person of their own no longer calls the
  timesheet preview (403). The screen knows the user has no person only when the whole people list is loaded
  (`complete`); otherwise it asks, and the answer decides, as before.
- **Additions, within the same screen (to review):**
  - "Waiting for approval" shows only with `workforce.timesheets.approve`. Resolve, Void punch and the missed-punch
    form show only with `workforce.time.manage`. These are the server's own rules (`modules/gigaops/module.yaml`).
    Before this, a technician who submitted a week was offered Approve on it, which the server refuses, and the journey
    records that as a bug. A technician still sees their own exceptions, read-only. `timeActions` is tested against the
    shipped default roles.
  - The screen fetches the sign-in context once (it fetched it twice).
  - Because the web now checks those two permissions, `pnpm modules:catalog` adds `platform` to their entries in
    `packages/contracts/src/rbac/permission-catalogue.generated.ts`, as for `maps.nodes.read` and `analytics:read`.
- **Outside the listed scope, needed by the design:** the section route (`app/(app)/gigaops/[section]/page.tsx`, the
  redirect), its test, the generated permission catalogue, and two e2e specs that named `/gigaops/attendance`
  (`gigaops-p5-p8`, `uat-screen-inventory`). The Workforce API and `modules/gigaops/module.yaml` are unchanged.
