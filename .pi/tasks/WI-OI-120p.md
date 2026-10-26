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
- **Slice 5 — tracker + bulk resend/revoke built (2026-10-25):** `inviteStatus` (pure, `contracts/tenancy`, 4 unit
  tests) derives one status (acceptance final > revoke > expiry > pending). `listDelegatedInvites` is the join tracker:
  the invites into the head's units (people:read/manage), each with its status, no tokens (`GET
  current/delegated-invitations`, `people:read`). `bulkRevokeDelegatedInvites` revokes only still-pending invites in
  the head's units (accepted/foreign ids skipped, audited). `bulkResendDelegatedInvites` rotates a fresh one-time link
  for pending invites, re-authorizing each as if freshly invited (unit still managed, roles still allowed+held,
  SoD-clean) so a resend cannot outlive the head's authority; all-or-nothing, same id kept. Both guarded by
  `people:manage`; DTO `BulkInviteIdsSchema`. A shared `peopleUnits` helper now backs the single/bulk/tracker paths.
  Integration-tested (`bulk-invite.integration.test.ts`, 5 tests): valid batch + accept; all-or-nothing abort; tracker
  statuses + no token; resend rotates pending only (accepted skipped) and the new link works; revoke pending only +
  re-revoke no-op. Slice 5 (R14) complete; tenancy-nest 108 unit pass, audit:layers clean.
- **Slice 7 (bulk grants / offboarding) — offboarding built (2026-10-25):** the plan's exit line splits the actors —
  grants are the department head within allowances, offboarding is the administrator. `bulkOffboardMembers`
  (tenancy.service) lets an administrator suspend many members at once (`MemberStatus` has no DEACTIVATED at member
  level, so offboard = SUSPENDED; status gates access, roles are kept for a bounded reactivation). All-or-nothing under
  one tenant lock: an unknown id, or a suspension that would leave no workspace administrator
  (`assertTenantAdministratorRetained`), rolls the whole batch back; the actor's own membership and already-suspended
  members are skipped; a Super Admin / Tenant Admin target is protected as in `updateMember`. DTO
  `BulkOffboardMembersSchema`; route `POST current/members/bulk-offboard` (`users:update` + in-service admin check).
  Integration-tested (`bulk-offboard.integration.test.ts`, 5 tests): offboard two actives; skip self + already-suspended;
  unknown id refused (nothing changed); non-admin refused; the sole Tenant Admin can never be suspended (rolls back).
- **Slice 7 — bulk grant GATED (not built):** entitling existing members with a unit-scoped role runs through
  `resolveRoleScope` → `assertScopeEnforced`, which only permits a unit scope for a module on the
  `SCOPE_ENFORCING_MODULES` allow-list (currently just `asset-maintenance`). Until the gated R5 allow-list flip
  (owner/Security reference-data decision), a unit-scoped grant for Workforce/CMMS/etc. is either refused or cosmetic
  (the same latent scope-leak the delegated-invite accept path carries). Build the enforced bulk grant after that flip.
- **Slice 10 (platform-role review) — reviewed (2026-10-25):** CONFIRMED and locked with regression tests
  (`auth-nest/session-permissions.spec.ts`). A platform role (the `PlatformRole` enum is
  `PLATFORM_OWNER | PLATFORM_ADMIN | PLATFORM_AUDITOR`) gives tenant-wide data authority — the whole organization tree
  (`resolveTreeScope` with `tenantWide:true` → org scope `TENANT` / legacy `FLAT_TENANT`) and unbounded places
  (`resolveSpatialScope` → `UNBOUNDED`), via `hasTenantWideAuthority` (auth.service.ts). This is bounded to a workspace
  the holder **belongs to**: `assembleContext` checks the active-membership gate *before* platform roles are read, so a
  platform-role holder with no active membership is refused the tenant session (new test proves it). Platform roles
  grant tenant-wide **scope only, not permissions** — actions remain gated by the member's base role + assignments;
  workspace-admin authority is the member role (`isWorkspaceAdministrator`), never the platform role.
  - **Finding for Security (low, no current over-grant):** `hasTenantWideAuthority` keys off `platformRoles.length > 0`
    (any role). All three current enum values are intended tenant-wide, so it is correct today, but a future platform
    role added to the enum would inherit tenant-wide data authority silently. Recommend an explicit allow-set (mirroring
    the persona resolver). Also noted: the persona resolver (`contracts/auth/platform-context.ts`) lists five names
    (incl. `PLATFORM_OPERATOR`/`PLATFORM_SUPPORT`) not in the DB enum — the two lists are maintained separately.
- **Slice 9 (scope in every module, R14) — Procurement requisitions built (2026-10-25):** correcting the earlier note,
  record read/write scoping is **not** gated on the R5 `SCOPE_ENFORCING_MODULES` allow-list — that gate governs only
  unit-scoped role *grants* (`resolveRoleScope`), while filtering records by the principal's own org scope is what every
  scope-applying module already does. Procurement requisitions carry `org_unit_id` and the org replica is delivered, but
  reads ignored it. Added `organization/organization-scope.ts` (`resolveOrganizationAccess`, `orgReadCondition`,
  `canReadUnit`, `assertWritableUnit`) mirroring Analytics, and wired it into `listRequisitions` (read filter),
  `getRequisition` and the state-change writes (`submit`/`approve`/`reject`) via one `fetchScopedRequisition` choke
  point: a unit outside read access is not-found (invisible), outside write access is Forbidden. Fail-open when no org
  tree is in force, so workspaces without hierarchy are unaffected. 10 pure unit tests
  (`organization-scope.spec.ts`) + a Docker-gated cross-department integration test
  (`procurement-organization-scope.integration.test.ts`, 3 tests, run green: a North member can't list/read/change
  South's requisitions; tenant-wide sees all). Procurement suite 16 pass; typecheck clean.
- **Slice 9 — Orders (sales quotes + orders) built (2026-10-25):** same pattern, bigger surface — Orders' service
  reads/writes took `tenantId`/`actorId` and are called from the controller **and 7 window/workbench record-adapter
  sites**, so the scope is threaded through the service (both paths share it) by passing the `ModulePrincipal`.
  `universal-orders .../organization/organization-scope.ts` (copy of Procurement's); every quote + order read and write
  is scoped: `listSalesQuotes`/`listSalesOrders`/`getQuote`/`getOrder` + the controller's inline `listQuotes`/
  `listOrders` (read filter), `createQuote`/`createOrder` (create only in a writable unit), `acceptQuote`/`confirmOrder`/
  `convertQuoteToOrder`/`allocateOrderLine` + the controller's inline `cancelOrder` (out-of-read-scope → not-found,
  out-of-write-scope → Forbidden). ~21 call sites updated across controller + record-adapters; typecheck clean; orders
  suite 7 pass (6 adapter tests unaffected). Docker-gated cross-department integration test
  (`orders-organization-scope.integration.test.ts`, 3, run green: a North member can't list/read/confirm South's
  orders, tenant-wide sees both).
- **Slice 9 — Finance (fixed assets) built (2026-10-25):** finding — Finance's general ledger (books, accounts,
  periods, journals) is **tenant-level by design** and carries no unit; the only unit-bearing records are **fixed
  assets** (`org_unit_id`, nullable → null = tenant-shared). `financial-operations .../organization/
  organization-scope.ts` (copy of Procurement's); every fixed-asset read and write is scoped —
  `listFixedAssets`/`getFixedAsset`/`getAssetSchedules` (reads restructured from the one-shot `this.query` to
  `withTenantTransaction` so they resolve access on a client), `createFixedAsset` (create only in a writable unit;
  a null/shared unit needs tenant-wide), `capitalizeFixedAsset` (out-of-read → not-found, out-of-write → Forbidden).
  Asset classes stay tenant-level (unscoped). Controller's 5 calls threaded to `ModulePrincipal`. Typecheck clean;
  finance suite **71 pass** (no regression). **DB integration test deferred (documented):** a valid fixed asset needs a
  deep fixture chain (accounting book → account → asset class → asset, because `fixed_asset_classes` FK-chains to
  `chart_of_accounts`) and `financial-operations` has no throwaway-postgres harness; the scope logic is identical to
  the Docker-proven Procurement/Orders, and the wiring is typecheck-clean. Follow-up: build the finance harness + the
  cross-department fixed-asset integration test.
- **Slice 9 — CMMS units already done (verified 2026-10-25):** correcting the stale "Today" note — CMMS no longer
  applies place scope only. Its `auth/scope.ts` (`scopePredicates`/`assertWritableScope`, WI-OI-120be/120bu) filters
  work orders on **`department_id`** (units) and **`site_ref`** (places) for both reads and writes, driven by the
  principal's `organization` (UNITS) claim and assignments. Unit scoping is unit-tested (`scope.spec.ts`,
  `r5-assignment-scope.spec.ts`: a UNITS-scoped assignment yields the `department_id` predicate). No new code needed; a
  full DB dept-isolation integration test could be added for parity with Procurement/Orders, but the enforcement is in
  place and tested at the predicate level.
- **Slice 9 milestone:** the **primary record of every main module is now organization-scoped** — Procurement
  requisitions, Orders quotes+orders (both Docker-integration-proven), Finance fixed assets (wired; GL tenant-wide by
  design), CMMS work orders (units+places, already done), and Analytics/Catalogue/Workforce/Geospatial (pre-existing).
- **Slice 9 — Procurement purchase orders built (2026-10-25):** scoped every PO read+write — `getPurchaseOrder`,
  `listPurchaseOrders`, `issuePurchaseOrder`, `acknowledgePurchaseOrder` (via a `fetchScopedPurchaseOrder` choke
  point: out-of-read → not-found, out-of-write → Forbidden) and `createPurchaseOrder` (create only in a writable
  unit). PO methods already took `ModulePrincipal`, so no signature churn. Integration test extended
  (`procurement-organization-scope.integration.test.ts`, now 4 tests, run green: a North member lists/reads/issues
  only North's PO). **Vendor bills and debit memos carry no `org_unit_id`** (only requisitions, POs and
  approval-policies do) — they are isolated transitively via their parent PO; scoping them directly would need a join
  and is deferred. Procurement suite 16 pass; typecheck clean.
- **Slice 9 — remaining (secondary records, diminishing value):** Orders downstream documents (fulfillments, customer
  invoices, credit memos, AR-invoice projections, returns); optionally join-based scoping of Procurement vendor
  bills/debit memos. Note: the per-module `organization-scope.ts` is duplicated across
  Procurement/Orders/Finance, but **by design** — the glue maps module-sdk's plain `OrganizationScopeRefusal`/
  `OrganizationVersionPendingError` to NestJS `ForbiddenException`/`ServiceUnavailableException`, and `module-sdk` is
  deliberately Nest-agnostic, so the nest glue lives per nest module (Analytics does the same). Not a shared-helper
  candidate.
- **Not started / gated:** slice 6 workers-in-step (ties to WI-OI-120o, deferred); slice 7-grant + the R5 allow-list
  flip (unit-scoped role *grants*, owner/Security reference-data decision); slice 8 directory groups/SSO (R15, needs
  OIDC/SAML credentials).

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
