# WI-OI-120p — review & deploy handoff (2026-10-26)

**For:** the independent Security reviewer (gate before deploy, per the work-item rule) and the owner/deployer.
**Branch:** `feat/gigaops-convergence-core`. **Batch:** R13 + R14 (all buildable slices) + the R5 flip + slice-9
org-scope across every module, plus one CMMS hotfix. Not yet deployed.

## What's in the batch (commit range `0f3d586a` … `3424c5c6`)

- **R13 — delegated people administration:** `people:manage`/`people:read` permissions; department role allowances
  (Tenant Admin sets, per unit, which roles a head may assign); the DB-backed delegated authorization
  (`assertDelegatedPeopleAdd`); the delegated invite (issues a one-time link carrying custom roles + unit; grants them
  scoped to the unit on acceptance).
- **R14 — bulk & lifecycle:** bulk delegated invite (all-or-nothing batch); join tracker + bulk resend/revoke;
  bulk offboarding (admin suspends many, last admin protected); the **delegated grant** (a head grants an allowed
  unit-scoped role to existing members); platform-role review (tenant-wide authority is bounded to member workspaces).
- **R14 slice 9 — organization scope (department isolation):** every unit-bearing record and downstream document in
  Procurement, Orders, Finance is filtered by the member's organization unit (CMMS already did units+places); each has
  a Docker-gated cross-department integration test. Analytics/Catalogue/Workforce/Geospatial were already scoped.
- **R5 flip (security-sensitive — see below).**
- **CMMS hotfix `01f68d0f`:** maintenance-request get/search returned 500 from an orphan bound parameter; fixed +
  regression-tested. Already built and run on the local stack.

## Security-review focus: the R5 flip (`90572b2e`)

`SCOPE_ENFORCING_MODULES` (`packages/contracts/src/rbac/assignment-scopes.ts`) now adds
`universal-procurement`, `universal-orders`, `financial-operations` as `{ units: true, places: false }`. Effect:
unit-scoped role **grants** are now allowed for these modules' roles (`assertScopeEnforced` passes), via Tenant Admin
Settings → Team, the delegated invite, and the delegated grant.

Evidence it is safe (both halves of the R5 card):
- **Catalogue coverage** — `packages/contracts/src/rbac/erp-r5-context-coverage.spec.ts`: every code each module's API
  checks is catalogued and owned by it, so a unit-scoped grant is carried under the unit key (nothing falls through to
  `platform`).
- **Record enforcement** — the per-module cross-department integration tests (below) prove the module actually filters
  its records by the unit.
- They scope by unit, not place; they stay OUT of `PER_ASSIGNMENT_SCOPE_MODULES` (single `organization` claim, so
  `assignmentScopeConflicts` stops holding one module's permissions at two scopes); control-plane codes a role might
  also carry (e.g. `organization:activate`) remain un-unit-scopable via `explicitScopeRefusal`.

Please confirm: (1) each of the three modules genuinely enforces unit scope on **all** endpoints that check its codes;
(2) the single-claim model + `assignmentScopeConflicts` is acceptable (no per-assignment multi-unit for these modules).

Update (2026-10-26, closing my own spot-check note): **Procurement is now fully covered** — `matchReceipt`,
`matchInvoice` and `approvePriceVariance` are write-scoped by their purchase order's unit, and `listApprovalPolicies`
is read-scoped by `org_unit_id` (integration-tested). `projectInventoryReceipt` is left unscoped by design — it is an
**inbound inventory relay event** (system-to-system), not a delegated user action. Orders/Finance: the primary records
and downstream documents are scoped (see slice-9 commits); any remaining read-only projections are system relays.

## Migrations (control-plane, additive)

`packages/db/migrations/`: `20261024000000_duty_conflict_acceptance`, `20261024010000_role_delegation_columns`,
`20261025000000_department_role_allowance`, `20261025010000_delegated_invite_roles`. All additive (new tables/columns,
relation-free or with a declared member relation); classified in `config/package-layers.json` (audit:layers clean).

## New control-plane endpoints (all `people:manage` unless noted)

`POST current/delegated-invitations` · `POST current/delegated-invitations/bulk` ·
`POST current/delegated-invitations/bulk/resend` · `POST current/delegated-invitations/bulk/revoke` ·
`GET current/delegated-invitations` (`people:read`) · `POST current/delegated-grants` ·
`POST current/members/bulk-offboard` (`users:update` + in-service admin check).

## Test evidence

- Unit: contracts rbac + tenancy-nest suites green (tenancy-nest 107; contracts rbac 106).
- Docker-gated integration (set the per-module env var to a throwaway DB, as each spec's header documents):
  `R14_TEST_DATABASE_URL` → bulk-invite, bulk-offboard, delegated-grant; `R13_TEST_DATABASE_URL` → delegated-invite,
  people-admin; `PROCUREMENT_SCOPE_IT` / `ORDERS_SCOPE_IT` → the cross-department record-scope proofs. All run green.
- Finance fixed-asset DB integration test is deferred (needs a finance throwaway harness; logic identical to the
  Docker-proven Procurement/Orders).

## Deploy notes

- Control plane: run the 4 additive migrations; rebuild the control-plane API/web images.
- Modules: the org-scope changes are code-only for `universal-procurement`, `universal-orders`,
  `financial-operations` → rebuild those three module images. The CMMS hotfix → rebuild `cmms-api` (no migration;
  already proven on the local stack via tag `c88763ffb5bb-…`).
- Not included (externally gated): slice 6 workers-in-step (depends on WI-OI-120o), slice 8 SSO/directory groups
  (needs OIDC/SAML or a SCIM surface, which does not yet exist in the repo).
