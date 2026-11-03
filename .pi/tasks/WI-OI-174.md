# WI-OI-174: Reporting lines and approval routing

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 21 in `docs/plans/master-data-foundation-execution-plan.md` §6a.
- **Work item:** WI-OI-174. Evidence goes in `.pi/work/WI-OI-174.md`.
- **Size:** M. **Needs:** WI-OI-167. **Related:** plan v3 Phase 2 steps 2.8 (R3 segregation of duties) and 2.9 (R4
  delegation and revocation). **Review:** Security.

## Why (evidence, 2026-11-03)

There is no reporting line between workers or positions. A unit has one `managerUserId`, a login
(`packages/contracts/src/organization/index.ts:107`), checked only to be an active member and used for nothing else.
A timesheet is approved by anyone holding the permission in scope, except the worker and the submitter
(`modules/gigaops/apps/api/src/time/time.service.ts:368`); absences likewise. Customers expect "my manager approves
my time and leave, and someone covers when they are away".

## Goal

A position may report to another position (or to its unit's manager by default); approvals for a person's time,
absences and booking overrides go first to their line manager's queue, with a fallback to any approver in scope after a
set time; being a manager never grants access by itself (permissions and scope still decide).

## Scope

- **May change:** Workforce positions (optional `reportsToPositionId`, effective dated, no cycles; additive);
  approval queues ordered and filtered by "mine as line manager" with the fallback rule; organization chart view; tests.
- **Must not change:** who may approve (permission and scope stay the rule); the CMMS import/export files; another
  agent's work.

## Steps

1. Reporting line on positions; default to the unit manager when empty; refuse cycles.
2. "Waiting for me" queues for time and absences use the line; after the fallback period, anyone in scope may decide.
3. Delegation while away (R4) reuses the same queue: a delegate decides on the manager's behalf, recorded as such.
4. Tests: manager approves; peer cannot unless in scope after fallback; self-approval still refused.

## Done when

- [ ] Time and leave go to the line manager first, then fall back; access is unchanged
- [ ] `pnpm verify` green; Security review recorded; evidence in `.pi/work/WI-OI-174.md`

## Stop and ask if

- customers need matrix lines (a person with two managers) in the first version.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
