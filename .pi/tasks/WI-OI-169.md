# WI-OI-169: A booked technician can execute the work order

- **Status:** Approved (owner, 2026-11-03: "add into the next item to work"). Order: queue item 8 in
  `docs/plans/master-data-foundation-execution-plan.md` §6a, before WI-OI-164 (mobile CMMS work needs it).
- **Work item:** WI-OI-169. Evidence goes in `.pi/work/WI-OI-169.md`.
- **Size:** S. **Needs:** WI-OI-163 (record offers use the same rule). **Review:** Security (access change).

## Why (evidence, 2026-11-03)

CMMS asks Workforce for staff and projects the resulting bookings into `gigalibs_cmms.work_order_bookings`
(`modules/physical-operations-cmms/apps/api/src/relay/inbox.service.ts:132`), but "execute own" accepts only the work
order's `assigned_to` (`work-orders.service.ts:738`). A technician booked through Workforce therefore cannot start or
complete the work order they were booked for, and their phone would not list it.

## Goal

A person with a live booking (confirmed, dispatched or on site) on a work order may execute it with
`cmms.work-orders.execute-own`, exactly as the assignee may; the right ends when the booking is cancelled or completed.

## Scope

- **May change:** the Workforce booking facts (add the booked person's linked login, `platformUserId`, additive);
  the CMMS inbox projection and `work_order_bookings` (additive column through a new CMMS migration); the execute-own
  guard in `work-orders.service.ts`; the CMMS offer rule from WI-OI-163; tests.
- **Must not change:** the CMMS import/export files; `cmms.work-orders.write` behaviour; another agent's work; secrets.

## Steps

1. Workforce: booking created and status-changed facts carry `resourcePlatformUserId` (null when the person has no
   login).
2. CMMS: store it on `work_order_bookings`; ignore older versions as today.
3. Execute-own passes for the assignee or for a login holding a live booking on that work order; every other guard
   (state, sign-off, permits, version) is unchanged.
4. The WI-OI-163 offer for execute actions uses the same rule, so web and mobile show the same buttons.
5. Tests: booked person may start and complete; a cancelled booking stops it; another person is refused.

## Mobile part

WI-OI-164's "my work orders" lists work orders assigned to me **or** booked for me.

## Done when

- [ ] A booked technician without `write` starts and completes their work order; a cancelled booking removes the right
- [ ] Existing CMMS tests unchanged and green; `pnpm verify` green; compiled CMMS and Workforce app modules load
- [ ] Security review recorded; evidence in `.pi/work/WI-OI-169.md`; `.pi/NOW.md` updated

## Stop and ask if

- a crew booking (several people) needs a lead-technician rule beyond "any live booking may execute".

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
