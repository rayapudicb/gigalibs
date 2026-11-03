# WI-OI-171: Rosters — shift templates, repeating shifts and demand from any module

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 15 in `docs/plans/master-data-foundation-execution-plan.md` §6a. Part of M-WF3 (plan v3 Phase 6 step 2).
- **Work item:** WI-OI-171. Evidence goes in `.pi/work/WI-OI-171.md`.
- **Size:** L. **Needs:** WI-OI-167.

## Why (evidence, 2026-11-03)

A work requirement is one window of at most 31 days with a headcount and skills
(`packages/contracts/src/workforce/index.ts:856–878`); its source is one of `MANUAL`, `CMMS_WORK_ORDER`, `PROJECT`
(line 835). There is no shift template, rotation or recurrence, so a store, a security post or a plant crew is staffed
one requirement at a time, and events, field tasks, warehouse tasks and routes cannot ask for people at all. The
retired WFO model (`000021_wfo_engagements.up.sql:18`) is a design reference only; its tables are not revived.

## Goal

A planner defines a shift template once (place, times, days, headcount, skills or position) and publishes a roster
period; the platform creates the requirements for each shift, idempotently; any module can ask for people through one
declared source type.

## Scope

- **May change:** Workforce contracts and service (templates, roster periods, generation, publish), additive
  migrations; the requirement source becomes a declared list (each module declares its source key in its manifest,
  checked by the catalogue generator) instead of a fixed enum, keeping the three existing values; metadata windows for
  templates and rosters; tests.
- **Must not change:** existing requirements and bookings; the CMMS import/export files; another agent's work.

## Steps

1. Shift template: place, start and end time in the place's time zone, weekdays, headcount, skills or position,
   effective dates; overnight shifts handled.
2. Roster period: generate one requirement per shift (idempotent key per template and date); show conflicts with
   closures, absences and availability before publishing; publishing makes shifts visible to workers (WI-OI-170).
3. Sources: a module declares `spec.workforceSources` (key, label, reference format); the first new ones are roster
   (from templates), event (a project task), post (a place) and field task.
4. Changes after publishing: editing a template does not move booked shifts silently; affected bookings are listed for
   the planner.
5. Tests: daylight-saving changes, overnight shifts, regeneration without duplicates, conflicts.

## Done when

- [ ] A four-week roster for a store and a 24×7 security post is created from templates in one action, without
      duplicates when generated again
- [ ] A module can request people with its own declared source; the three existing sources still work
- [ ] `pnpm verify` green; evidence in `.pi/work/WI-OI-171.md`

## Stop and ask if

- the first customer needs shift swaps or open-shift bidding in the same card (propose a separate card).

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
