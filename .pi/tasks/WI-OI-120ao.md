# WI-OI-120ao: The week follows the clock, and site lists ask Geospatial only when allowed

- **Status:** Done (2026-10-15). On UAT as release `d75ccba`. Journey `8gti7u`: the technician clocks in and out and
  submits the week, and the approver approves it (the database shows the week APPROVED). Feature commits `df82260`,
  `2c4a45a`, `831ac8b` (journey).
- **Found by:** journey `89ac2g` on release `63178f6` (WI-OI-120ah and WI-OI-120an on UAT).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Why

- **Two of the journey's four blockers come from one gap: the week does not follow the clock.**
  - Screenshot `047`: the clock lists the technician's clock-in and clock-out (8:51 PM), while the Timesheet next to it
    shows an empty week (0h 00m, no rows) with "Submit week" disabled.
  - The server builds a row even for a zero-minute shift (`time.rules.ts`, the `CLOCK_OUT` case). So the empty week is
    the one loaded when the page opened, before the punches.
  - In `TimeAndAttendance.tsx`, the clock, the week and the exception inbox load on their own. Nothing tells the week
    or the inbox that a punch was recorded.
  - Consequences: the technician cannot submit ("The technician submits their week"), and the approver has nothing to
    approve ("The approver approves the technician's week").
- **New bug: `GET /api/maps/nodes` answers 403** on `/gigaops/time` for the technician and the approver ("An active
  Geospatial Studio entitlement and maps.nodes.read permission are required").
  - The shared `useSites` (`components/geospatial/SitePicker.tsx`) asks Geospatial for places whatever the workspace
    has. The journey's workspace has no Geospatial Studio.
  - The same hook is used by Availability, Jobs, Dispatch and the organization places panel.
  - Without places, the clock offers only "No site" and does not say why.
- **UX:** an empty week has no guidance ("An empty table with no guidance").

## Design (approved by the owner, 2026-10-14)

1. The Time screen keeps a "recorded" counter:
   - the clock raises it after each punch it records and each queued punch it sends;
   - "my week" and the exception inbox reload when it changes.
2. `useSites` asks for places only when the workspace has Geospatial Studio and the user holds `maps.nodes.read`. It
   reads both from the session context, as the module gate does. Otherwise it returns no places and says so
   (`available: false`).
   - On the clock: "The site check needs Geospatial Studio" in place of a silent "No site" only.
3. An empty week says so: "No punches in this week yet."
4. Tests:
   - the counter wiring;
   - `useSites`'s rule as a pure function: entitled and permitted asks; otherwise it does not;
   - the journey's submit and approve steps.

## Scope

- **May change:** `apps/workflow-platform/components/gigaops/TimeAndAttendance.tsx`,
  `apps/workflow-platform/components/geospatial/SitePicker.tsx` (`useSites`), their tests, the journey spec if needed.
- **Must not change:** the Workforce and Geospatial APIs; CMMS's own place loading (`GeospatialPlacesProvider`), whose
  viewer 403 stays with plan v3 step 1.1; other agents' work.

## Done when

- [x] On UAT, the journey's technician submits their week and the approver approves it. (Journey `8gti7u`.)
- [x] No Workforce screen calls `/api/maps/nodes` for a workspace without Geospatial Studio, or for a user without
  `maps.nodes.read`. (Journey `8cho6n`: no such 403.)
- [x] An empty week says so.
- [x] Evidence recorded; built, reviewed and deployed by the owner.

## What was built (2026-10-14)

- **The week follows the clock:**
  - the Time screen keeps a `recorded` counter. The clock raises it after each punch it records and after sending
    queued punches;
  - "my week" and the exception inbox reload when it changes, and only then. Each keeps the last value it saw, so
    other reloads are not doubled.
- **Places only when they can be read:**
  - `lib/geospatial-access.ts` `canReadPlaces` applies the Geospatial proxy's rule: the module switched on, its
    entitlement enabled, `maps:read` and `maps.nodes.read`;
  - a test checks it against the proxy's module key and route permission, and that the module is not locked (the
    browser cannot see the server-only UAT preview);
  - `useSitesFor(context)` asks for places only then and reports `available`. `useSites()` reads the session itself
    (`components/auth/use-auth-context.ts`) for the other screens: Availability, Jobs, Dispatch, the organization
    places panel and CMMS's place provider.
- **On the Time screen:**
  - one session is shared by the clock, the week and the site list. The screen no longer fetches the session on its
    own;
  - when places cannot be read, the clock says "Sites come from Geospatial Studio, which you cannot use here, so
    punches are recorded without a site check";
  - an empty week says "No punches in this week yet." instead of showing an empty table.
- **Scope note:** CMMS's place provider uses the shared hook, so its viewer's `/api/maps/nodes` 403 (plan v3 step
  1.1) also stops, without any change to CMMS code.

## Security review (2026-10-14): approve; notes fixed

- Verified: `canReadPlaces` matches the proxy exactly (same module rule, entitlement, permission and wildcard
  handling); no new data exposure (`/api/auth/context` was already read in the browser); the `recorded` counter
  makes one week and one inbox call per punch, with no loop and no repeat of the offline queue; `ownPerson` keeps
  its meaning; no authorization change; the release matches df82260 exactly.
- **Low-1, fixed:** "No punches in this week yet." was untrue after a clock-in with no clock-out (lines are completed
  shifts only; the open clock-in shows as an issue). It now reads "No completed shifts in this week yet."
- **Low-2, fixed:** a session that could not be read was treated as "not allowed". The clock then wrongly said
  Geospatial was not available, and other screens lost their sites until a reload. Now `placesDecision` lets the proxy
  decide when the session is unreadable (the worst case is the old 403) and says nothing.
- **I-1, fixed:** the clock now reports only queued punches the server recorded, not refused ones.
- **I-3, fixed:** the drift test also checks the gate in `signed-module-proxy.ts`. The extra session request per
  site-listing screen remains (speed, not safety); a shared session for all screens is a later cleanup.
- **I-2:** the scope note above records the CMMS effect.

## On UAT, and the journey's own race (2026-10-14)

- **Deploy:** `d75ccba` deployed (~16:14Z). The owner's pasted run was a repeat, refused before any change ("UAT no
  longer matches the backed-up predecessor"; no lock left).
- **Read-only checks:**
  - all 11 containers run `d75ccba`, healthy, with 546 tables;
  - the live build holds "No completed shifts in this week yet." and the site message, and no longer holds "No
    punches in this week yet.";
  - no error lines and no `maps/nodes` requests in the logs since the deploy.
- **Journey `8cho6n`** (5 blockers, 1 bug, 6 UX):
  - the `/api/maps/nodes` 403s and the empty-table finding are gone;
  - "The technician clocks in and out" failed with "No Clock out button". Screenshot `046`, taken when the step
    ended, shows the clock "Working" with "Clock out", and the week already showing the open shift. So the screen
    worked, and the journey looked too early;
  - cause: the journey's `press` looked once, straight away. `settle` waits on `waitForLoadState('networkidle')`,
    which returns at once in a page that has been idle once. After "Clock in" it therefore waited only 400 ms, while
    the punch, the punch list and then the "Clock out" button take longer. The previous run passed by timing luck;
  - the submit and approve blockers follow from it: no clock-out, so the week has only an open shift.
- **Fix (journey spec, not deployed):** `press` waits up to 5 s for a matching control before it counts as missing,
  and still prefers buttons, then links, then tabs. The spec type-checks in strict mode and lists.
