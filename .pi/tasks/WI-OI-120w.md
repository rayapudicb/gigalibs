# WI-OI-120w (R2): Roles held per department or site

- **Status:** Approved (owner, 2026-10-06). M1a card of `docs/plans/platform-implementation-plan.md`, after R1
  (WI-OI-120q), S1 and S16. Implements ADR-0034 §1, §2 (inclusion), §5, §6 and §7. Each slice is shown before it
  starts. **Slice 1 done** (committed 2026-10-06; Security review requested by the owner before deploy); slices 2 and
  3 next. Evidence: `.pi/work/WI-OI-120.md` § WI-OI-120w. Independent Security review before deploy (access change).
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

### Slice 2: managing assignments (Settings → Team)

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
- [ ] Settings → Team manages several assignments per person, with the transition rule.
- [ ] The context carries assignments; `scopeFor` passes the North/South test.
- [ ] Checks pass; Security review recorded; evidence recorded; images built and handed to the owner.

## Stop and ask if

- the reconciliation shows any member gaining or losing access;
- a module reads `customRoleId` or the membership's scope in a way the move would change;
- the context size exceeds the limit for a realistic member (more than about 20 assignments).
