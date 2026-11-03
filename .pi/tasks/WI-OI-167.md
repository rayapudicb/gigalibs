# WI-OI-167: Workforce scope completion — a supervisor acts only on their own people

- **Status:** Approved (owner, 2026-11-03: "add into the next item to work"). Order: queue item 5 in
  `docs/plans/master-data-foundation-execution-plan.md` §6a. Start only when it is the first unfinished item and the
  active slot (`config/sdlc-governance.json` `activeImplementationWorkItems`) is free.
- **Work item:** WI-OI-167. Evidence goes in `.pi/work/WI-OI-167.md`.
- **Size:** M. **Finishes:** WI-OI-120ho (R5 Workforce, plan v3 Phase 2 step 2.7), whose enforcement of the four
  person-centric reads is built (`modules/gigaops/apps/api/src/common/scope.ts`). **Review:** an independent Security
  review before the owner deploys (plan v3 rule 2: access change).

## Why (evidence, 2026-11-03)

- A Workforce role cannot be given at a unit or place: `gigaops` is not in `SCOPE_ENFORCING_MODULES`
  (`packages/contracts/src/rbac/assignment-scopes.ts:86`), so `assertScopeEnforced` refuses with
  `ROLE_SCOPE_NOT_ENFORCED` (`packages/tenancy-nest/src/role-scopes.ts:75`). Only the person's own scope limits them.
- `BookingsService.candidates` reads every active person in the workspace, ordered by name, first 200
  (`modules/gigaops/apps/api/src/bookings/bookings.service.ts:195`, `MAX_CANDIDATES = 200`), with three queries per
  person. WI-OI-120ho's audit table missed it.
- `createBooking` checks the requirement's place, the person's skills, availability and overlaps, but never that the
  person is within the caller's scope (`bookings.service.ts:267–330`).
- Work requirements carry no unit, so requirements, bookings, time (`time.service.ts:658`) and pay are limited by
  place only. A supervisor limited by unit and not by place sees and books every person and approves every timesheet.

## Goal

A supervisor whose scope is a unit, a place or both can find, book, approve and pay only the people and work inside
that scope; the platform then allows Workforce roles to be given at units and places.

## Scope

- **May change:** `modules/gigaops/apps/api/src/bookings/`, `time/`, `pay/`, `availability/`, `common/scope.ts`; a new
  additive migration `modules/gigaops/db/runtime-foundation/000030_*` (nullable `organization_unit_id` on
  `work_requirements`, with an index); `packages/contracts/src/workforce/index.ts` (optional `organizationUnitId` on
  `CreateWorkRequirementV1`, additive); `packages/contracts/src/rbac/assignment-scopes.ts` and a new
  `workforce-r5-context-coverage.spec.ts` beside `cmms-r5-context-coverage.spec.ts`; tests.
- **Must not change:** the CMMS import/export files; another agent's work (uncommitted files in `~/dev/gigalibs`);
  secrets; the web on port 5180; the retired `wfo_*` tables.

## Steps

1. **Candidates:** filter people with `peopleScopeClause` in SQL; search and page (a name or skill filter, a cursor)
   instead of the first 200 by name; compute qualification, availability and overlap in set-based queries, not per
   person.
2. **Booking:** refuse a person outside the caller's scope (`WORKFORCE_OUT_OF_SCOPE`, the same plain message as the
   place check); keep the override rule unchanged.
3. **Unit on demand:** a requirement may name its owning unit (default: the requester's single write root, else
   none); lists, reads and writes of requirements and bookings apply unit scope as well as place scope; a CMMS-sourced
   requirement takes the work order's owning unit from the relay fact when present.
4. **Time and pay:** timesheet approval, time exceptions, corrections and pay runs apply unit scope through the person's
   position (scope by assignment) as well as place; fail closed when scope is unknown.
5. **Workspace-wide codes:** capability definitions, absence types and working-calendar templates are workspace
   master data. Recommended (confirm with the owner at claim): reading them is allowed at any scope; changing them
   needs a workspace-wide role, so the scope rule refuses those codes at units or places.
6. **Allow-list:** add `gigaops` to `SCOPE_ENFORCING_MODULES` (`{ units: true, places: true }`). *Corrected while
   building:* **not** to `PER_ASSIGNMENT_SCOPE_MODULES` (WI-OI-120ho step 3 said both): that list is for modules that
   decide access per assignment, as CMMS does; Workforce reads the single organization and place claims, like the ERP
   modules. The coverage test proves every code the Workforce API checks is owned by `gigaops`.
7. Integration tests on a throwaway PostgreSQL 16 (as `scope.integration.test.ts`): North ≠ South by unit and by
   place for candidates, booking, requirement lists, timesheet approval and pay runs; workspace-wide still sees all.

## Mobile part

None to build: `/mobile/v1` calls the same API and inherits the scope. WI-OI-170 relies on this card.

## Done when

- [ ] A North supervisor (unit or place) cannot list, book, approve or pay a South person; the candidate list shows
      only in-scope people and can find any of them by name or skill (no 200 cut-off)
- [ ] A Workforce role can be given at a unit or a place; workspace-wide codes are refused at a scope
- [ ] Coverage test and integration tests green; `pnpm verify` green; compiled Workforce app module loads under Node
- [ ] Security review named and recorded; journey "North supervisor ≠ South" passes on UAT after the owner's deploy
- [ ] Evidence in `.pi/work/WI-OI-167.md`; WI-OI-120ho marked finished by this card; `.pi/NOW.md` updated

## Stop and ask if

- a Workforce read or write cannot be scoped without changing an existing record contract (beyond the additive unit);
- scope by assignment hides people a supervisor needs to staff new hires (unassigned people): propose the rule first.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
