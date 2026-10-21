# WI-OI-120bu: CMMS journey `hb53xk` — the six blockers (triage and fixes)

- **Status:** Built (2026-10-21): F1–F3 in git (assignment-scoped CMMS reads, technician REFERENCE picker, journey asserts assignee + North unit). **Open:** owner release worktree deploy, journey **0 blockers**, PHASE-1-CM1 tick.
- **Work item:** WI-OI-120gd (Phase 1 W1 exit: journey 0 blockers) and WI-OI-120bk (unit scope for CMMS).
- **Size:** M.

## The run

Journey **`hb53xk`** on UAT (2026-10-20 23:27 UTC, release `1d8d2634`): 69 findings, **6 blockers**, 36 layout, 20
accessibility, 6 UX, 1 bug. All six blockers are in stage 5 (CMMS) and follow from two product defects; the rest of the
journey (sign-up, settings, organisation, people and roles, workforce) completed.

## Root causes (verified)

1. **CMMS ignores unit-scoped role assignments when listing (product, High).**
   - The technician holds "North CMMS tech hb53xk" (`cmms.work-orders.read`, `execute-own`, …) assigned at
     **North plant**, the work order's own unit (`department_id` = North plant), but no organisation access grant.
   - The control plane builds a scope per assignment (`auth.service.ts`: UNITS at North plant), but the module context
     CMMS reads takes `organization` from **access grants only** (`resolveTreeScope`): UNITS with no roots.
   - CMMS `scopePredicates` turns empty roots into `FALSE`, so the technician (and the viewer-role auditor) see no work
     order at all. The supervisor, who also got an access grant, sees it.
   - This contradicts WI-OI-120bk ("unit and place assignments for roles take effect for CMMS") and WI-OI-120w
     ("access is decided per assignment").
   - Blockers caused: "North-scoped technician sees North work orders", and through it the five that follow.
2. **A work order cannot be assigned to a person (product, High).**
   - "Assigned technician" (`assigned-to`) is a free TEXT field ("Login of the technician…"). `assertCanExecute` requires
     `assigned_to` to equal the caller's subject, which nobody can type.
   - In `hb53xk` the North work order was saved with `assigned_to` = NULL; even when visible, the technician could not
     start, log labour on or complete it (execute-own), so the supervisor could not review or sign off.
3. **The journey reported an assignment it did not make (journey, Medium).**
   - The `create` helper skips a field it cannot fill without failing, so "raises a work order and assigns the
     technician" was DONE with no assignee. The North work order's unit came from the supervisor's default, not from the
     step.

## Fixes (proposed)

| # | Fix | Where | Test |
| --- | --- | --- | --- |
| F1 | A module request is scoped by the assignments that grant the permission it uses: the organisation scope in the CMMS context is the union of the read roots of the caller's assignments holding a CMMS read permission (with access grants as today). Decide the place with `solution_architecture`: the control plane's context for the module (preferred: every module gets it) or CMMS's `principalFromContext`. | `packages/auth-nest` (context) or `packages/module-sdk` | A user with only "CMMS role at North plant" lists North and not South work orders; a user with no CMMS assignment sees none; the R5 scope tests stay green |
| F2 | "Assigned technician" becomes a person picker: a REFERENCE lookup over the workspace's members who hold `cmms.work-orders.execute-own` or `.write` in the work order's unit, storing the user's subject and showing their name. | CMMS dictionary (`windows.mjs`) and a lookup resolver | Picking the technician stores their subject; the technician can start the order; picking someone outside the unit is refused |
| F3 | The journey asserts what it claims: the assignee is set and the North unit is set explicitly, and a field the helper cannot fill fails the step. | `e2e/specs/journey-tenant-to-value.spec.ts` | A run with F1 and F2 deployed reaches 0 blockers |

## Also seen (not blockers)

- The viewer-role auditor is offered "New work order" (a UX finding: the button should follow `cmms.work-orders.write`).
- Workforce answered 503 "organization version is still being delivered" once during the run (transient; the
  organisation projection had not reached Workforce yet).

## Done when

- [ ] F1, F2, F3 built with tests; independent review; released by the owner.
- [ ] Journey on UAT: 0 blockers; run id recorded in `.pi/NOW.md`; WI-OI-120gd and PHASE-1-CM1 row 1 updated.
