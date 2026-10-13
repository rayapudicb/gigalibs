# WI-OI-120u (M-WF1): Workforce on metadata windows, with U20a

- **Status:** Approved (owner, 2026-10-06). First M1b card of `docs/plans/platform-implementation-plan.md`; needs R1
  (WI-OI-120q) and S16 (WI-OI-120s). Each slice is shown before it starts.
- **Work item:** WI-OI-120 (U20a in `remediation-backlog.md`). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L (three slices, each shown and approved before it starts)

## Why

- Workforce screens are hand-written (`GigaOpsWorkforceWorkbench.tsx`, `TimeAndAttendance.tsx` and others in
  `apps/workflow-platform/components/gigaops`). A workspace cannot adjust them without a release.
- The older workforce operations screens (`/wfo/*`: workers, engagements, shifts, expenses) have services in
  `modules/gigaops/apps/api/src` but no route, no module permission and no canonical owner (U20a).
- There are two lists of workers: Workforce resources and WFO workers (T1b merges them; this card stops the second
  from growing).

## Goal

People, skills, jobs, availability, absences and bookings are metadata windows each workspace can adjust. The WFO
screens are reachable, permissioned and owned, or retired.

## Design

1. **Slice 1, people and skills.** Windows over record adapters that call the existing services
   (`workforce-resources.service.ts`, capabilities, positions):
   - people;
   - skills and qualifications as a child tab;
   - jobs and positions.
   The login link is an action that only an administrator holds (`workforce.resources.link`, kept from b7f8a53). The
   login picker becomes a lookup over workspace members.

   **Owner decisions, 2026-10-13** (after review of the first draft):
   - The member picker is a platform lookup (`workspace-members`, served by the web app as the signed-in user; option
     A). "Linked login" is a picker field only holders of `workforce.resources.link` can change, rather than a separate
     action: the same authority, one path.
   - **People only** replaces its workbench screen in Slice 1. Jobs & positions keeps the workbench at `/gigaops/jobs`
     until its window can revise job profiles, place people in positions (a window of its own: a window has one level
     of child tabs) and pick a site. Its window source is held in `dictionary/jobs-window.held.mjs`; its record adapters
     are registered and tested. That work is a follow-up slice, shown before it starts.
2. **Slice 2, availability, absences, bookings.**
   - Availability, and absence requests with approve and reject actions. Another manager must decide your own absence
     (kept from b7f8a53).
   - Bookings list and read.
   - Clock-in and the scheduling and dispatch board stay components (named exceptions) inside governed screens.
3. **Slice 3, U20a.** For each WFO surface, one of:
   - **adopt:** a route, a `workforce.*` permission, a module-role grant and a metadata window. Workers are adopted
     only as a read-only list until T1b moves them onto resources;
   - **retire:** the service stays, but nothing new is written to it, and it is listed for removal.
   Each choice is shown to the owner with the surface's data counts before it is made.
4. **Time and timesheet approval** for linked workers is M-WF2 (needs T1a). The time screens stay as they are until
   then.
5. **Every slice is followed by:**
   - the conversion check (S16);
   - the module roles updated;
   - the Workforce section of the tenant-to-value journey rerun.

## Scope

- **May change:** `modules/gigaops` (adapters, windows, `module.yaml` pages, routes and roles), the Workforce
  components in `apps/workflow-platform/components/gigaops` that the windows replace, generated catalogues, journey
  specs.
- **Must not change:** WFO data (no migration of workers here; that is T1b), applied migrations, running services.

## Proof

- Adapter tests per entity, including the login link refused for non-administrators and own-absence decisions refused.
- `scripts/verify-module-conversion.mjs gigaops` passes.
- Journey: an administrator adds a person and links their login; a supervisor records availability; the person
  requests an absence; another supervisor decides it.
- `pnpm build`, `pnpm test`, `pnpm verify`; Security review before deploy (new permissions for WFO surfaces).

## Done when

- [ ] People, skills, jobs, availability, absences and bookings are metadata windows.
- [ ] Every WFO surface is adopted or retired, as decided by the owner.
- [ ] Checks pass; evidence recorded; images built and handed to the owner per slice.

## Stop and ask if

- a WFO surface holds UAT data the owner has not decided about;
- a window needs behaviour the domain service does not have.
