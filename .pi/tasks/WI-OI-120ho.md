# WI-OI-120ho (R5 Workforce): unit & place scope on Workforce

- **Status:** Proposed — large security-critical build; needs the North≠South journey proof (owner deploy) + post-UAT security review.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.7). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

A role given to someone at a unit or a place limits what they see and change in Workforce to that unit/place —
e.g. a supervisor scoped to North cannot see or touch South's people, positions, bookings, time or absences.
This lets `gigaops` join `SCOPE_ENFORCING_MODULES`, the security allow-list that permits scoped role assignment.

## Why this is L, not a registration

`SCOPE_ENFORCING_MODULES` (`packages/contracts/src/rbac/assignment-scopes.ts:86`) is a **security claim**: adding
`gigaops` asserts — and a coverage test must prove — that **every** permission code the Workforce API checks
enforces unit **and** place scope. Adding it without that proof is a data-leak (a role granted at North would act
everywhere). CMMS R5 took four cards (WI-OI-120z/aa/ab/ac) for exactly this. Partial scope enforcement already
exists (`jobs.service.ts assertWritableScope`/`assertPositionOwner`; `time.service.ts assertTimesheetScope`;
`spatialScope` on the principal), so this completes and proves it rather than starting from zero.

## Steps

1. **Coverage audit (read-only):** for every `gigaops` code in the generated permission catalogue
   (resources, jobs, positions, availability, absences, calendars, bookings, time, timesheets, pay…), trace its
   read and write paths and record whether they filter/guard by unit and by place. Produce the gap list.
2. **Fill the gaps:** add unit/place filtering to every read that lacks it and a scope guard to every write,
   using the principal's `spatialScope`/`organization`. Fail closed when scope is unknown.
3. Add `gigaops` to `PER_ASSIGNMENT_SCOPE_MODULES` and `SCOPE_ENFORCING_MODULES` ({ units: true, places: true }).
4. **Coverage test** (mirror `cmms-r5-context-coverage.spec.ts`): every code the Workforce API checks is covered by
   the minted context's unit+place keys; update `assignment-scopes.test.ts`.
5. Unit tests per path: North role cannot read/modify a South record; UNBOUNDED still sees all.

## Done when

- [ ] Every Workforce code enforces unit+place scope (audit closed, gaps filled, tests green).
- [ ] `gigaops` in both scope structures with the coverage test; `pnpm verify` clean.
- [ ] Journey proof on UAT: a North supervisor cannot see South's people/positions/time/absences (owner deploy).
- [ ] Independent security review (post-UAT). Evidence in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated.

## Stop and ask if

- A read path cannot be scoped without a schema change (unit/place not stored on a record).
- Enforcing scope would break an existing UNBOUNDED/workspace-wide flow the owner relies on.
