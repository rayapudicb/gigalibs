# WI-OI-120w (R2): Roles held per department or site

- **Status:** Approved (owner, 2026-10-06). M1a card of `docs/plans/platform-implementation-plan.md`, after R1
  (WI-OI-120q), S1 and S16. Implements ADR-0034 §1, §2 (inclusion), §5, §6 and §7. Each slice is shown before it
  starts.
  - **Slice 1:** done and on UAT (2323b99, deployed 2026-10-07). Reconciliation: 433 members, 0 differences.
  - **Slice 2a:** done and on UAT (060d3cb, e07cdba and the grant bound 1237c9d, in release c5e6cb3, deployed
    2026-10-07). The journey's technician holds two module roles.
    - Security review: "ship after fixes". The fixes are committed in e07cdba (re-check: "ship").
    - M3: the owner said "add the grant bound" (2026-10-06); it is built and awaits "commit".
  - **Slice 3:** approved by the owner on 2026-10-07 ("approved slice 3"). Committed f395dbd. Security review: "ship
    after fixes"; the fixes (cap 20, compact claim, size guard, web shape check, department scope) await "commit".
  - **Next:** slice 2b.
  - Evidence: `.pi/work/WI-OI-120.md` § WI-OI-120w. Independent Security review before deploy (access change).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L (three slices)

## Why

- **A member holds one base role and at most one custom role** (`TenantMember.customRoleId`). Module roles are
  stored as custom roles, so nobody can be both Maintenance technician and Workforce member, or Journal Approver and
  Maintenance planner. The tenant-to-value journey had to give each persona a single role for this reason.
- **A member's scope is one list for everything they do.** Their units (`OrgScopeGrant`) and places
  (`spatialScopePlaceIds`) apply to every permission they hold. So "approver in North, reader in South" cannot be
  expressed: uniting roles and scopes would make the person an approver in North and South (ADR-0034, the High
  finding of the plan review).

## Goal

A person holds **several role assignments, each a role at a scope**: the whole workspace, some departments (with
everything under them), or some places (with everything inside them).
- Access is decided **per assignment**, never by combining one assignment's permissions with another's scope.
- Removing one assignment removes only its access.
- Nobody gains or loses access in the move.

## Design

### Slice 1: the model and the move (no change in access)

- **A new table, `role_assignments`** (control plane, forward migration):
  - the member;
  - the role, as a custom role id (module roles are already custom roles);
  - the scope kind: `WORKSPACE`, `UNITS` or `PLACES`, with its unit ids or place ids;
  - who granted it, when, and why;
  - its revocation (when, by whom, why).
  Assignments are never edited, only granted and revoked, so the history stays.
- **The base role** (Tenant Admin, Manager, Member, Viewer, Guest) stays on the membership, at the member's current
  scope. A Tenant Admin is always workspace-wide.
- **The move (owner, 2026-10-06: "ok"):** each member's custom role becomes one assignment whose scope kind is
  **`MEMBER`**: the member's own scope, exactly as today (organization grants with their read or read-and-write
  access, the legacy department, or places, whichever applies). No scope is translated, so the move changes no one's
  access by construction; the reconciliation report still proves it. Explicit `WORKSPACE`, `UNITS` and `PLACES`
  scopes are given in slice 2. `customRoleId` is read only by the move. A later card drops it after the release.
- **Reconciliation report:** for every member, effective access before and after the move (permission by
  permission, scope by scope) must be identical. Any difference stops the release.

### Slice 2a (approved 2026-10-06; built): several roles per person, at their own scope

- **As built:**
  - there is no separate `GET`: the member list Settings → Team already reads (`users:read`) carries each member's
    live roles, oldest first;
  - nobody changes their own roles unless they are a Tenant Admin (403 `ROLE_SELF_ASSIGNMENT`), and only a Tenant
    Admin changes a Tenant Admin's roles (WI-OI-120v);
  - the member update no longer takes a role: roles change only through role assignments (review M2);
  - **grant bound** (owner, "add the grant bound"; review M3):
    - someone who is not a Tenant Admin gives only what they hold, whether giving a member a role or adding
      permissions to a role (403 `GRANT_BEYOND_OWN`, naming what is missing);
    - creating a role and taking one away are not bounded;
    - R4 replaces this with bounds per assignment, and 2b must bound by scope as well.
  - a change reaches control-plane checks on the member's next request, which reads live assignments. A signed
    module context carries the roles it was signed with for at most 300 s. No session version is bumped yet; that
    stays in slice 2b.

- **Why first:** slice 1's session already enforces `MEMBER` assignments, so several of them are safe today. This
  removes the one-extra-role limit (Maintenance technician and Workforce member; Journal Approver and Maintenance
  planner) before any new scope exists.
- **Endpoints:**
  - `GET current/members/:memberId/role-assignments` (`users:read`);
  - `POST current/members/:memberId/role-assignments` (`roles:assign`, with role and reason);
  - `POST …/role-assignments/:id/revoke` (`roles:assign`, with reason).
  - `roles:assign` is a new control-plane permission; Tenant Admins hold it through `roles:*`.
- **The trigger is replaced:**
  - the column becomes the oldest live `MEMBER` assignment, kept for display and rollback;
  - a write to the column from an earlier release revokes only the role it names, never the others;
  - `search_path` is set on the function (review note).
- **Settings → Team:** each member's roles appear as removable tags, with "Add role" and a reason on every change.
  The single role picker goes. Every grant and revoke is audited and takes effect on the member's next request.
- **The journey:** the technician holds Maintenance technician and Workforce member.

### Slice 2b (approved by the owner 2026-10-07: "approved 2b"; committed 645a72e; review fixes built; slice 2c to be confirmed)

- **After the Security review ("do not ship as is", H1 and H2), units and places are gated per module.** A role can be
  given at units or places only once every module checking its codes is proven, by its R5 card, to limit records by
  that dimension (`SCOPE_ENFORCING_MODULES`, empty today), and no code is checked by the platform. Until then, only
  the member's own scope and the whole workspace can be given. The plumbing (session claims, per-module contexts, the
  transition rule) is in place for R5 to switch on.
- **Each R5 card must:** fix its module's context key so it matches the catalogue (Geospatial, Connector Hub), prove
  enforcement per dimension, and add its entry.

- **As built:**
  - **Migration:** `20261007000000_member_role_assignments_scoped` lifts the `MEMBER`-only constraint and bounds the
    id lists.
  - **Rules** (`packages/contracts/src/rbac/assignment-scopes.ts`):
    - `moduleCheckedCodes` reads the codes each module checks from the generated catalogue, including other
      families it reads (CMMS checks Workforce codes);
    - `assignmentScopeConflicts` implements the transition rule, skipping modules listed in
      `PER_ASSIGNMENT_SCOPE_MODULES` (empty until R5);
    - `moduleGrantScope` finds the one scope a module's permissions come from.
  - **Service** (`role-scopes.ts`):
    - `resolveRoleScope` validates a scope: units must be active and placed in the version in force; a role carrying
      a control-plane code applies to the whole workspace or own scope only.
    - `assertScopesConsistent` applies the rule when a role is given, when a role's permissions are edited (for every
      holder), when a base role changes, and on SCIM role changes.
    - Explicit scopes are given by Tenant Admins only (403 `ROLE_SCOPE_ADMIN_ONLY`), and a role is held once whatever
      its scope.
  - **Session:**
    - each assignment carries its claim scope; a role at an explicit scope also carries the claims a module still
      reading one scope receives for it;
    - units resolve like a member's own grants (`resolveUnitRootsScope`: roots, plus the legacy department list with
      descendants);
    - without a version in force, a unit role covers nothing.
  - **Contexts:** `buildPlatformContext` gives each module the claims of the one scope its permissions come from:
    the member's own, or the role's. A conflict gets an empty scope.
  - **Settings → Team:** administrators choose "Where" (own scope, whole workspace, units through the unit picker, or
    places), and tags read "Role · North plant".
  - **Session freshness:** contexts are minted per request and the guard reads live assignments, so no
    session-version bump is needed (recorded in the evidence).



- **Explicit scopes on an assignment.** A role can be given at the member's own scope (as today), the whole
  workspace, some units, or some places.
  - **Data:** a forward migration lifts the `MEMBER`-only constraint; the scope check from slice 1 stays.
  - **Validation:** units must be active units of the workspace's primary tree; places are checked as member places
    are today.
  - **Who:** only a Tenant Admin gives an explicit scope. Anyone else gives own-scope roles only, within the grant
    bound. Scoped delegation is R4.
- **The transition rule (ADR-0034 §6).** Until a module enforces per-assignment scope (its R5 card), a member may not
  hold assignments with **different scopes that grant that module's own permissions** (the module's permission
  families). The base role counts as own scope.
  - The refusal names the module.
  - It is checked when a role is given, and when permissions are added to a role someone holds.
  - A list of modules that enforce per-assignment scope starts empty; each R5 card adds its module.
- **Contexts per module.** Each context is minted for one module.
  - **Modules not yet moved:** the existing `organization` and `spatial_scope` claims come from the one scope the
    transition rule allows for that module: own scope as today; a unit list; a place list; or the whole workspace.
    So "technician only at North plant" works now, without touching the member's unit grants.
  - **Fail-safe:** if the scopes ever disagree, the module gets an empty scope.
  - **Moved modules:** they read the assignment claims through `scopeFor`.
  - **Session order:** the session lists each assignment with its real scope.
- **Settings → Team.**
  - Adding a role (administrators) offers "Where": their own scope, the whole workspace, units (unit picker) or
    places (place picker).
  - Tags show the scope, for example "Maintenance technician · North plant".
  - The transition-rule refusal is explained in words.
- **Session freshness.** The control-plane guard reads live assignments on every request; the web fetches the session
  without a cache and mints each module context per request; jobs re-read their owner on each run. So a role change
  applies on the next request. The plan is to prove this with a test and record it, not to add a session-version bump.
  The bump stays in R4 if delegation needs it.
- **Role inclusion moves to its own slice 2c** (a role that includes other roles, an acyclic check, and included
  permissions taking the including assignment's scope). It touches the role editor and every permission computation.
- **Proof:**
  - **Units:** scope validation; the transition rule's refusal; per-module legacy claims from each scope; the
    fail-safe on a conflict.
  - **r2_proof:** an admin gives "Maintenance technician" at North only. The CMMS context carries North, and the
    Workforce context the member's own scope.
  - **Rest:** SCIM unaffected; the journey; `pnpm verify`; Security review before deploy (an access change).
- **Size:** L, about 2–3 working days. Slice 2c: M, about 1 day.

### Slice 2c: roles that include other roles (owner: "approved 2c", 2026-10-07; built and checked, awaiting "commit" and the Security review)

- **As built:**
  - **Data:** migration `20261007010000_custom_role_inclusions` (both ends in one workspace, no self-inclusion, each
    pair once, an included role kept until it is taken out); the `CustomRoleInclusion` model, classified in the
    package layers and the privacy inventory.
  - **Expansion:** rbac-nest `includedRolePermissions` (one recursive query, at most five deep) feeds
    `memberRoleGrants`, so the session, the context claims and the control-plane guard see what each assignment grants
    with its inclusions, at its scope.
  - **The graph:** tenancy-nest `role-graph.ts` (load, expand, the including roles, validation). Inclusions must be
    roles of the workspace, not the role itself, at most 10, with no cycle and at most 5 deep, checked from every root
    that includes the edited role.
  - **Edits are grants.** Expanded additions are checked for the edited role and every role including it: the
    editor's grant bound, the transition rule for every holder, and the control-plane and units-and-places gate for
    holders at units or places. Giving a role uses its expanded permissions. Removals are never blocked.
  - **Deleting** a role another includes is refused (409 `ROLE_INCLUDED`, naming the including roles).
  - **Role editor:** an "Includes" picker on each workspace role, and "Grants N permission(s) in total".
  - **Performance:** the role graph is read only when the member holds roles.


- **Data:** a forward migration adds `custom_role_inclusions` (role, included role, who, when).
  - Both ends must be roles of the same workspace (composite foreign keys).
  - No self-inclusion; each pair once.
  - At most 10 inclusions per role.
- **Rules on save:**
  - the inclusion graph must stay acyclic and at most 5 deep;
  - a role that is included elsewhere cannot be deleted until it is removed from those roles (409, naming them).
- **What a role grants:** its own permissions plus, transitively, those of the roles it includes, computed in one
  place (rbac-nest). Included permissions take the including assignment's scope (ADR-0034 §2). Every consumer reads
  the expanded set: the session and its context claims, the control-plane guard, the grant bound, the transition rule,
  the units-and-places gate, and the role-edit holder checks.
- **Editing inclusions is a grant.** Adding an inclusion gives every holder the included role's permissions, so it is
  checked like adding permissions: the grant bound for a non-admin editor, the transition rule for every holder, and
  the gate for holders at units or places. Removing an inclusion is never blocked.
- **The role editor:** "Includes" lists roles the editor may include, and a role shows the roles it includes and
  what it grants in total.
- **Proof:**
  - unit tests: cycle and depth refusals, expansion;
  - r2_proof: "Maintenance lead" includes Maintenance planner and Workforce supervisor, and a holder's session holds
    both; a cycle is refused; a non-admin cannot include a role beyond what they hold;
  - `pnpm verify`; Security review before deploy.
- **Size:** M, about 1 working day.

### Slice 2b: explicit scopes, switched on once slice 3 enforces them (the rest of the original slice 2)

- **On a member:**
  - list their assignments (role, scope, granted by, since);
  - add an assignment (role, scope, reason);
  - revoke one (reason).
  The role editor's list comes from R1's catalogue.
- **Rules on save:**
  - Only members holding `roles:assign` give or revoke assignments. Adding Tenant Admin remains WI-OI-120v's rule.
  - **Transition rule (ADR-0034 §6):** until a module enforces per-assignment scope (its R5 card), a member may not
    hold two assignments with **different scopes that grant that module's permissions**. The screen explains the
    refusal and names the module.
  - **Inclusion:** a custom role may include other roles. The inclusion graph is checked acyclic on save, and
    included permissions take the including assignment's scope.
- **Every grant or revoke:**
  - is audited with its reason;
  - bumps the member's session version, so their next request is re-authorized, and module contexts (at most
    300 s) expire.

### Slice 3: the signed context carries assignments

- **As built (2026-10-07):**
  - **The claim.** `PlatformContextV1.assignments` = `{ version: 1, items: [{ grants, scope }] }`.
    - `grants` is an unpadded base64url bitmap over the context's `granted_scopes`, so an assignment can name only
      what the context grants. Only the one canonical encoding is accepted, checked when the token is signed and when
      it is verified. An absent `scope` is `MEMBER`.
    - `scope` is `MEMBER` (the member's own scope, the existing `organization` and `spatial_scope` claims), `TENANT`,
      `UNITS` (tree version and unit roots) or `PLACES`.
    - The session puts the base role, with direct codes, first, then each role. Every one is `MEMBER` until
      slice 2b. The other kinds are defined and tested but not yet emitted.
  - **Helpers.** `encodeAssignmentGrants` and `decodeAssignmentGrants` (contracts); `memberRoleGrants` (rbac-nest).
    Both the session and the kernel worker's subject carry the assignments.
  - **The SDK.** `principal.assignments` and `scopeFor(principal, permission)` give the coverage of each assignment
    that grants the permission. A context without the claim answers as before: a held permission applies at the
    member's own scope.
  - **Size.** A member holds at most 20 live roles (409 `ROLE_LIMIT`). The worst configuration (20 roles with
    100-character names, the whole catalogue) signs under 14 KB. A token over 15 KB is refused when minted
    (`CONTEXT_TOO_LARGE`), so no module answers 431 (Node's header limit is 16 KB). The web checks only the
    assignments' shape, so a member over a limit keeps the application.
  - **The control plane.** No control-plane record list is scoped by unit today; organization scope is used only for
    module contexts. Nothing changed there; R5 uses `scopeFor` module by module.

- **`PlatformContextV1` gains `assignments`** (optional, additive): for each assignment, its permissions and its
  scope (`WORKSPACE`, unit roots with the tree version, or place roots).
  - `granted_scopes`, `organization` and `spatial_scope` stay, derived as today, for modules that have not moved.
  - A size limit is tested.
- **The module SDK gains `scopeFor(principal, permission)`:** the units and places where this person holds this
  permission, from the assignments that grant it. Each module's R5 card uses it. The SDK test proves "approver in
  North, reader in South".
- **The control plane** uses the same per-assignment rule for the records it scopes by unit (ADR-0018).

## Scope

- **May change:**
  - `packages/db` (schema, one forward migration, the move);
  - `packages/contracts` (assignment and context contracts);
  - `packages/auth-core` and `packages/auth-nest` (context and session);
  - `packages/tenancy-nest` (assignments API and rules);
  - `packages/module-sdk` (`scopeFor`);
  - `apps/workflow-platform` (Settings → Team);
  - tests and the reconciliation script.
- **Must not change:** applied migrations, permission codes, module enforcement (R5 cards), running services.

## Proof

- **Migration** on the isolated proof database: the move and the reconciliation report on a copy of the UAT
  shape. Zero differences.
- **Tests:**
  - per-assignment evaluation ("approver in North, reader in South": approve in North, read only in South, nothing
    elsewhere);
  - removing one assignment;
  - the transition rule's refusal;
  - an inclusion cycle refused;
  - session version bumped on change;
  - context size.
- **The tenant-to-value journey**, with its personas holding two module roles each.
- `pnpm build`, `pnpm test`, `pnpm verify`; Security review before deploy.

## Done when

- [x] Assignments exist, with the move proven to change no one's access (proof database; UAT after deploy).
- [ ] Settings → Team manages several assignments per person, with the transition rule. (2a: several roles at the
      member's own scope, built; explicit scopes and the transition rule in 2b.)
- [x] The context carries assignments; `scopeFor` passes the North/South test (slice 3, 2026-10-07).
- [ ] Checks pass; Security review recorded; evidence recorded; images built and handed to the owner.

## Stop and ask if

- the reconciliation shows any member gaining or losing access;
- a module reads `customRoleId` or the membership's scope in a way the move would change;
- the context size exceeds the limit for a realistic member (more than about 20 assignments).
