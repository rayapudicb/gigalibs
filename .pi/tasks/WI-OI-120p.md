# WI-OI-120p: Access model and people administration (bulk and delegated)

- **Status:** In progress (owner approved the Phase 3 start, 2026-10-24). Independent Security review before deploy.

## Progress (2026-10-24)

- **Slice 1 (module roles):** largely in place — modules declare `roles:` in `module.yaml` and `syncDefaultRoles`
  copies them into a workspace.
- **Slice 2 (several roles per person):** done — the `member_role_assignments` model (R2); a member's permissions
  are the union across live assignments (and R3 SoD / R4 delegation build on it, WI-OI-120hp/hq).
- **Slice 3 (department allowances) — built:** `department_role_allowances` table (Prisma model + migration;
  relation-free, classified core); `setDepartmentRoleAllowance`/`removeDepartmentRoleAllowance`/
  `listDepartmentRoleAllowances` in `tenancy.service` (Tenant-Admin-guarded, audited).
- **Slice 4 (delegated people management) — core + authorization built:** `assertDelegatedPeopleAdd` (pure,
  `contracts/rbac/people-admin.ts`, 5 unit tests) + `authorizeDelegatedPeopleAdd` (DB-backed,
  `tenancy-nest/people-admin.ts`) which loads the unit allowances and the head's held roles and applies the rule.
  Integration-tested against a throwaway control DB (5 tests: allowed+held→ok; out-of-unit / not-allowed /
  not-held-escalation / base-role-above-MEMBER → refused). `people:manage`/`people:read` registered in the
  control-plane catalogue.
- **Slice 4 (delegated invite) — complete:** `delegatedInvite` (tenancy.service): loads the head's `people:manage`
  units, authorizes (`authorizeDelegatedPeopleAdd` + a duty-conflict check on the carried roles), refuses an existing
  membership, and issues a one-time invite carrying the custom roles + unit (no email — raw token returned once, same
  as `createInvite`). `tenant_invites` gained `customRoleIds`/`unitId` (migration); `acceptInvite` grants those roles
  scoped to the unit on acceptance (pure `invitedRoleAssignments`, unit-tested). Route
  `POST current/delegated-invitations` (`people:manage`). End-to-end integration-tested on a throwaway control DB
  (`delegated-invite.integration.test.ts`: invite→accept grants the tech role scoped to North; out-of-unit refused);
  tenancy-nest suite 96 green, no regression.
- **Slice 5 (bulk add, R14) — core built (2026-10-25):** `validateBulkPeopleAdd` (pure, `contracts/rbac/people-admin.ts`,
  3 unit tests) checks every row before anything is created — malformed/duplicate/already-member email, no roles, and
  the delegated rule per row — so a batch is all-or-nothing. `bulkDelegatedInvite` (tenancy.service) loads the head's
  `people:manage` units and allowances once (`loadPeopleAdminScope`, extracted from the slice-4 authorizer), validates
  the batch + a per-row duty-conflict (R3) check, then in one transaction issues each invite via the shared
  `writeDelegatedInvite` (extracted from `delegatedInvite`) — one bad row rolls the whole batch back. Returns one
  one-time link per invite for download (no email, W2). DTO `BulkDelegatedInviteSchema` (rows bounded but permissive,
  so bad cells become per-row errors, max 500 rows); route `POST current/delegated-invitations/bulk` (`people:manage`).
  Integration-tested on a throwaway control DB (`bulk-invite.integration.test.ts`: a valid 2-row batch creates both +
  an accepted link grants the tech role scoped to North; an out-of-unit + already-member batch aborts, creating none).
  The single-invite path (slice 4) re-verified green after the extraction; tenancy-nest suite 96 pass; audit:layers clean.
- **Slice 5 — remaining:** a join tracker (list delegated invites by status, scoped to the head's units) and bulk
  resend/revoke of pending invites.
- **Not started:** slice 6 workers-in-step (ties to WI-OI-120o, deferred), 7 bulk grants, 8 directory groups/SSO (R15),
  9 scope in Procurement/Orders/Finance + CMMS units, 10 platform-role review.

The 2026-10-06 "Today" section below predates the R2 assignments work and is stale where it says "at most one custom role."
- **Work item:** WI-OI-120 (tenant-to-value; WI-OI-120m journey). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** XL (delivered in slices, each approved and deployed separately)

## Owner direction (2026-10-06)

"A department head or manager can hire any number of persons and entitle modules for them", with bulk upload and bulk
invitation; departments of 100 to 200 people using different modules.

## Owner decisions (2026-10-06)

- **What a department head may assign:** an admin-approved list per department (e.g. Maintenance: technician,
  planner). Never Tenant Admin; never more than the head holds.
- **Seats per module:** not now. Anyone given a module role can use the module; seats can come with billing.
- **CMMS user import** (writes invitations straight into `public.tenant_invites` from the CMMS connection, accepts
  TENANT_ADMIN, returns no links): switched off in WI-OI-120n; replaced here through the control plane.

## Today (verified in code)

- **Access is four checks on every call:** the workspace has the module (entitlement); the person holds the permission
  (from their roles); the record is in their scope (organization units, or places for CMMS); ownership and
  maker-checker where the module applies them.
- **A member** has one base role (TENANT_ADMIN, MANAGER, MEMBER, VIEWER, GUEST), at most one custom role, extra
  permissions, a department, and unit and place grants.
- **Organization scope** applies only once the primary tree has a version in force. Then Tenant Admins (and anyone
  with a platform role) see the whole workspace; everyone else sees their granted units and below, plus shared
  records. A member with no grant sees only shared records.
- **Modules applying organization scope:** Analytics, Workforce, Geospatial, Catalogue and part of Inventory. CMMS
  applies place scope only. Procurement, Orders and Finance apply neither.
- **Invitations:** one at a time, Tenant Admin only. SCIM syncs users; its groups are the five base roles only.

## Slices

1. **Module roles:** ready-made custom roles per module (Maintenance technician, planner, manager; Warehouse operator,
   supervisor; Workforce scheduler, timesheet approver; Finance clerk, approver; Procurement buyer, approver; Sales
   order clerk), shipped as system roles a workspace can copy and adjust.
2. **Several roles per person:** a member holds several custom roles (schema change, forward migration); permissions
   are their union.
3. **Department allowances:** the Tenant Admin sets, per unit, which roles its head may assign.
4. **Delegated people management:** a `people:manage` permission scoped to the head's units. The head invites or adds
   people only into those units, only with allowed roles, only for modules the workspace has.
5. **Bulk add:** CSV upload or a pasted list (name, email, unit, roles, worker yes or no). Every row is checked before
   anything is created; invitations are created together; one-time links are given as a download until email
   delivery is configured; a tracker shows who has joined; resend and revoke in bulk.
6. **Workers in the same step:** "is a worker" also creates the Workforce person linked to the login (with WI-OI-120o).
7. **Bulk unit grants:** grant or move many people between units at once; offboarding deactivates in bulk.
8. **Directory groups:** SCIM groups map to a role plus unit, so enterprise customers add nobody by hand.
9. **Scope in every module:** organization scope in Procurement, Orders and Finance, and units (not only places) in
   CMMS; each module gets a test that a department-A user cannot read or change department-B records.
10. **Platform roles:** review that any platform role gives tenant-wide data authority inside a workspace the person
    belongs to.

## Proof

- The discovery journey grows a department step: the hierarchy is switched on; the North plant head bulk-adds
  technicians with allowed roles; they join with their links; a North technician cannot see South plant's work orders;
  the head cannot assign Tenant Admin or a role outside the department's list.
- HTTP proofs for delegated invitation (unit, role and escalation refusals) and for scope in each module.

## Stop and ask if

- a slice needs a role or permission that lets a head act outside their units or above their own authority;
- email delivery needs a provider or credentials.
