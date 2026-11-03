# WI-OI-167 evidence — Workforce scope completion (R5 Workforce, finishing WI-OI-120ho)

## 2026-11-03 — built (queue item 5, claimed by Claude)

**What was wrong (from the code, 2026-11-03):** a Workforce role could not be given at a unit or place (`gigaops` was
not in `SCOPE_ENFORCING_MODULES`), and inside Workforce several paths ignored the caller's scope: the booking candidate
list read every active person (first 200 by name), booking never checked the person, demand carried no unit (so
requirements, bookings and time were limited by place only), and — found while building — deciding or cancelling an
absence, filing one for someone else, setting someone's working week, recording a qualification, editing a person and
opening a person's full record checked no scope at all.

**Built:**
- Migration `000030_workforce_requirement_owning_unit` (nullable `organization_unit_id` on `work_requirements`, partial
  index; additive, forward-only; existing demand stays shared). Pins moved to 30 (`compose.workforce.local.yaml` ×2,
  `WORKFORCE_SCHEMA_CONTRACT_VERSION`); `verify-migration-pins` agrees.
- Contracts: optional `organizationUnitId` on `CreateWorkRequirementV1` and `WorkRequirementV1`;
  `ListBookingCandidatesV1QuerySchema` (search, limit ≤ 100, offset) and `BookingCandidatePageV1` (`nextOffset`);
  optional `owningUnitId` on `CmmsStaffingRequestedV1` — CMMS sends the work order's `department_id`, Workforce owns the
  demand under it.
- `common/scope.ts`: the booking path into a person's scope covers units as well as places; new helpers
  `requirementScopePredicates`, `requirementOwner` (named unit, or the single write root of a member limited to one
  unit; refuses a unit outside write access or not in the version), `assertRequirementWrite` (ADR-0018 D3: shared demand
  is read by all, changed only workspace-wide), `assertPersonInScope`, `peopleUnitClause`, `limitedByUnit`.
- Bookings: requirements and bookings listed, read, locked and changed within unit and place; candidates filtered by the
  caller's people in SQL, searchable by name or reference, qualified people first, paged (no 200 cut-off; availability
  worked out for the page only); booking refuses a person outside scope (`WORKFORCE_OUT_OF_SCOPE`) and a change to demand
  outside write access.
- Time: timesheet list and exception list limited to the caller's units' people (or their own); timesheet approval and
  detail, exception resolution and acting on someone else's punches, previews, submissions and corrections refuse a
  person outside the caller's units.
- Pay and pay export: refused for a member limited by unit, as they already were for one limited by place (a pay run
  covers the whole workspace's week).
- Absences and working weeks: deciding, cancelling and filing for someone else, and creating or ending someone's working
  week, refuse a person outside scope; absence types and the workspace calendar refuse a member limited by unit (as by
  place).
- People and skills: editing a person, recording a qualification and opening someone else's full record need the person
  in scope (the record answers "not found" otherwise); defining a capability needs workspace-wide access.
- Access rules: `gigaops: { units: true, places: true }` in `SCOPE_ENFORCING_MODULES` — not in
  `PER_ASSIGNMENT_SCOPE_MODULES`: Workforce reads the single organization and place claims, like the ERP modules (the
  card's step 6, inherited from WI-OI-120ho, was wrong on this point). `WORKSPACE_ONLY_PERMISSIONS` (the three pay
  codes) are refused at any scope with their own message (`ROLE_SCOPE_NOT_ENFORCED`, "covers the whole workspace").
- Permission scan: a client component (`'use client'`) whose checks only show or hide buttons may say
  `// permission-scan: display-only`; its codes are then not counted for the platform. Used once, on
  `components/gigaops/TimeAndAttendance.tsx`, so `workforce.timesheets.approve` and `workforce.time.manage` lose their
  platform owner and can be given at a scope. The catalogue changed in exactly those two entries.
- Web: the dispatch board's candidate panel has "Find a person" and "Show more people"; the client passes search and
  offset.

**Tests:**
- `packages/contracts/src/rbac/workforce-r5-context-coverage.spec.ts` (new): every code Workforce checks is catalogued and
  owned by `gigaops`; Workforce enforces units and places and is not per-assignment; each Workforce-only code is allowed
  at a unit except the pay codes; codes shared with the platform stay refused. `assignment-scopes.test.ts` updated
  (Workforce and CMMS codes together may be scoped; pay refused); `permission-catalogue.test.ts` covers the marker
  (client files only).
- `modules/gigaops/apps/api/src/bookings/bookings-scope.integration.test.ts` (new, throwaway PostgreSQL 16, all 30
  migrations): demand lists by unit and by place; candidates only the caller's people (by unit and place) and 404 on
  another unit's demand; search and paging; booking someone else's person or onto shared demand refused for a
  unit-limited supervisor, allowed in scope and for the workspace; new demand takes the supervisor's single unit and
  another unit is refused; time follows the unit; a North approver cannot decide a South absence, South can. With the
  existing `common/scope.integration.test.ts`: 11 of 11 pass
  (`R5_TEST_DATABASE_URL=postgres://postgres:proof@127.0.0.1:55467/r5_proof`, container `wi167-workforce-proof`, kept).
- Workforce API unit tests 232 pass (17 skipped are the database-gated ones); web tests 988 pass; access-rule tests 170
  pass.

**Open for the owner:**
- Decision recorded in the card (step 5), built as recommended: capability definitions, absence types, the workspace
  calendar and pay are workspace-wide; a limited member reads them but does not change them (pay: not at all).
- Follow-up (not in this card): `workforce.logbook.read`/`write` (checked by the mobile session projection) and
  `workforce.configuration.manage` (a kernel job) are still checked by the platform, so a role holding them is given
  only for the whole workspace or the person's own scope.
- After the owner's deploy: the journey "North supervisor ≠ South" on UAT, and the independent Security review (access
  change, plan v3 rule 2).

**Verification:** `pnpm verify` PASS (19 steps, 14 database proofs not run without `PROOF_DATABASE_URL`); compiled
Workforce (`gigaops.module`) and CMMS app modules load under Node; the control plane links (it stops only at its
runtime settings, as before). `next build` for the dispatch board runs with the deploy hand-over. Status: **Built**.
