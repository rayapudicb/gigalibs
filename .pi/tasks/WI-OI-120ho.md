# WI-OI-120ho (R5 Workforce): unit & place scope on Workforce

- **Status:** Audit done (2026-10-24) — **blocked on a person-scoping design decision** before enforcement can close and the allow-list can flip.
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

## Coverage audit result (2026-10-24)

| Area | Place (spatial_scope) | Unit (organization) | Notes |
|---|---|---|---|
| jobs / positions / engagements | **yes** | **yes** | `assertWritableScope` + `assertPositionOwner` + `organizationAccess`; `department_id` is an org unit. |
| bookings | **yes** | no | `bookings.service` filters by `place_ids`; no unit guard. |
| time / punches / timesheets | **yes** | no | `time.service` place filter + `assertTimesheetScope`; time is per-person, no unit. |
| calendars / closures | **yes** | no | `availability.service` place guard on site calendars. |
| pay / pay-export | **yes** | no | place filter on pay runs/exports. |
| **resources (people directory, picker)** | **NO** | **NO** | `listResources`/`lookupResources` filter by `tenant_id` only. |
| **absences (approver queue)** | **NO** | **NO** | `listAbsences` filters by `tenant_id` only. |
| **working-week patterns** | **NO** | **NO** | `listAllPatterns` tenant-wide. |
| capabilities (skill definitions) | n/a | n/a | tenant-wide master data; arguably correctly unscoped. |

**Gating decision (stop-and-ask):** a person carries **no intrinsic unit or place** (`workforce_resources` has no
site/unit column). So people and their person-level records (absences, working weeks) cannot be place/unit-filtered
without deciding the model:
- **(a) by assignment** — a person is "in my scope" if they hold an active position/engagement/booking in my
  units/places (join-based filter; a person in several units shows in each). No schema change.
- **(b) home unit/place on the person** — add a column, scope by it (schema change + data backfill).
- **(c) people stay workspace-visible** — only operational place-records (positions, time, bookings, pay) are
  scoped; then the allow-list entry must be `{ units: false, places: false }` for the *resource* codes, which the
  current all-or-nothing `SCOPE_ENFORCING_MODULES` shape does not express per-code — so this needs a model change too.

Recommendation: **(a) scope-by-assignment** — matches how jobs/positions/bookings already work and needs no schema
change, though the resource/absence queries get a join against positions+engagements+bookings. Owner/Security to confirm.

## Steps (after the decision)

1. ~~Coverage audit~~ — **done** (table above).
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
