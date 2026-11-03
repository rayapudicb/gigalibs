# WI-OI-170: Mobile Workforce — my shifts, clock in and out, my time; supervisor tablet

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 14 in `docs/plans/master-data-foundation-execution-plan.md` §6a (after milestone B).
- **Work item:** WI-OI-170. Evidence goes in `.pi/work/WI-OI-170.md`.
- **Size:** L (two repositories). **Needs:** WI-OI-167 (scope), WI-OI-163 (record offers). **Review:** Security
  (new mobile routes), device proof as in WI-OI-165.

## Why (evidence, 2026-11-03)

On mobile, Workforce has only the shift logbook. The Workforce mobile catalogue marks the resource directory as built
but contained, capabilities and qualifications as next, and availability, scheduling, time and attendance and pay as
planned (`gigalibs_mobile/packages/features/workforce/src/catalog.ts`). The server side is ready for a phone: a punch
carries a device id, a device event id (a resend returns the original punch), the place, the booking and the location,
and only the server sets the geofence result (`packages/contracts/src/workforce/index.ts:998`). Own-absence and
timesheet commands exist (`RequestOwnAbsenceV1`, `SubmitTimesheetV1`).

## Goal

A worker sees their shifts, accepts or declines, clocks in and out at the place (with breaks), checks and submits
their timesheet and asks for leave on a phone; a supervisor on a tablet sees today's coverage at their places, fills an
open requirement from in-scope candidates and approves time and absences. Same login, permissions, scope and records
as the web.

## Scope

- **Platform (`~/dev/gigalibs-rounds`):** adapters in `packages/auth-nest/src/mobile/` (pattern:
  `mobile-logbook.controller.ts`, forwarding to Workforce with the caller's token); routes in
  `apps/workflow-platform/lib/mobile-bff.ts` `MOBILE_ROUTES`; Workforce endpoints for "my bookings" (the person linked
  to the login) and a worker acknowledgement on a booking (accept, or decline with a reason that reopens the
  requirement; additive); the BFF sets the geofence result from the Place boundary; mobile contracts in
  `packages/contracts/src/mobile/`.
- **Mobile (`~/dev/gigalibs_mobile`):** features in `packages/features/workforce` and `workforce-journeys`; compiled
  in `apps/operations/src/navigation/compiled-features.ts` with `requiredEntitlement: 'gigaops'` and the Workforce
  permissions; punches queued offline and sent with their device event id.
- **Must not change:** the CMMS import/export files; another agent's work; secrets; the web on port 5180.

## Steps

1. Worker: my shifts (today, next 14 days), accept or decline; clock in, break, clock out against the booking and
   place; my timesheet (preview, submit); request absence; see the decision.
2. Supervisor tablet: coverage at my places (requirements with headcount and gaps), fill from candidates (WI-OI-167
   scope), approve or reject timesheets (exceptions shown), decide absences.
3. Offline: punches captured offline keep their device time and event id; the server answers the same punch on
   resend; a punch far outside the place is accepted with its geofence result and raises a time exception, never lost.
4. Tests per route (allowed, denied, other unit, other place); mobile unit and journey tests; device proof on a test
   workspace on UAT (WI-OI-165 method).

## Done when

- [ ] A worker completes a shift on a phone: accept, clock in, break, clock out, submit; the supervisor approves it on
      a tablet; pay-ready totals match the web
- [ ] Offline punches arrive once, in order, with geofence results; nothing is lost on resend
- [ ] Scope holds on every route (North supervisor cannot see South); Security review recorded
- [ ] `pnpm verify` green in both repositories; device proof recorded; evidence in `.pi/work/WI-OI-170.md`

## Stop and ask if

- shifts need repeating rosters to be useful for the first customer (then WI-OI-171 goes first), or a country needs
  a punch rule (rounding, breaks) that belongs in its pack.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
