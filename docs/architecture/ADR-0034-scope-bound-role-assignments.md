# ADR-0034: Scope-bound role assignments and effective access

- **Status:** Accepted in direction by the owner, 2026-10-06 (decision D1 of
  `docs/plans/platform-implementation-plan.md`: "held per unit/site"). Independent Architecture and Security reviews
  pending (D7). Detailed contract changes are made by cards R1, R2, R3, R4 and R5, each approved first.
- **Date:** 2026-10-06
- **Work item:** WI-OI-120 (Stage 0, D1)
- **Amends:** ADR-0018 (member scope grants) and ADR-0003 D2 and D5 (permissions and personas).
- **Reference:** iDempiere role-organization access (`AD_Role_OrgAccess`, `MRole.isOrgAccess`, included roles
  `AD_Role_Included`), concepts only (GPL v2; decision D8).

## Context

- **Today a member holds** one base role (TENANT_ADMIN, MANAGER, MEMBER, VIEWER, GUEST), at most one custom role
  (`TenantMember.customRoleId`, `packages/db/schema.prisma`), extra permissions, and organization-unit and place
  grants that apply to everything the member may do (ADR-0018, ADR-0006).
- **Permissions and scope are separate lists.** Giving one person several roles by uniting their permissions and
  uniting their scopes would widen authority: "approver in North, reader in South" would become "approver in North
  and South". The read-only review of the implementation plan (2026-10-06) recorded this as a High finding.
- **Eleven permission matchers** disagree on wildcards (CMMS, Geospatial, Workforce, Analytics, the module SDK guard
  and record dispatcher, the renderer, the web and Configuration Studio). The record dispatcher derives a dotted
  code's family incorrectly. Card R1 replaces them with one.
- **The WI-OI-120m journey** showed that only Tenant Admins could work in a new customer's workspace; batch 1 added
  module roles, but still one custom role per person.

## Decision

### 1. An assignment is a role held at a scope

- A **role assignment** is (role, scope). The role is a base role, a module role or a workspace custom role. The
  scope is one of:
  - **workspace-wide**;
  - **units**: organization units, each covering its descendants in the primary tree version in force (ADR-0018);
  - **places**: Geospatial places, each covering what is inside it (ADR-0006).
- A member may hold **several assignments**. Tenant Admin is always workspace-wide.
- **Effective access is computed per assignment, never across them.** A request on a record is allowed when at least
  one assignment both grants the permission and covers the record's unit or place. A list returns, for the list
  permission, the rows covered by the assignments that grant it. Permissions from one assignment never combine with
  the scope of another.
- **Records without a unit or place** (workspace-shared, ADR-0018) are read with any assignment that grants the read
  permission; changing them needs a workspace-wide assignment granting the change.

### 2. Roles

- **Inheritance:** a custom role may include other roles; the inclusion graph is acyclic and checked on save.
  Included permissions take the including assignment's scope.
- **Module roles** shipped in `module.yaml` (WI-OI-120n) are assignable like custom roles; a workspace may copy and
  adjust them.
- **Personas** stay a routing lens (ADR-0003 D5), derived from assignments (card R16).

### 3. Segregation of duties

- A module declares conflicting permission pairs per document type (for example create and approve a journal).
- An assignment that would give one person both sides at overlapping scope is refused or, where the workspace allows
  it within the approval policy's minimums (D3), flagged.
- The document engine also checks the actor at each transition (maker ≠ checker), whatever the assignments say.

### 4. Delegation and revocation

- **Delegation** gives another member a subset of one of the delegator's assignments, at no wider scope, for a
  fixed period, with a reason; it is audited and ends automatically.
- **Revocation** (removing an assignment, a role change, a delegation ending) bumps the member's session version, so
  the next request is refused (`authVersion`); signed module contexts live at most 300 s and carry that version.

### 5. The signed context

- `PlatformContextV1` gains **assignment claims**: for each assignment, a compact permission-set reference and its
  scope (`TENANT`, unit roots, place roots) with the tree version. The existing `organization` and `spatial_scope`
  claims are kept, derived from the union of read scopes, for modules not yet moved (§6).
- The module SDK resolves "which units and places may this person use for this permission" from the claims, and
  every module uses that one helper (cards R1 and R5).

### 6. Transition without widening

- Until a module adopts per-assignment scope (its R5 card), a member may not hold assignments with **different
  scopes that grant that module's permissions**: the assignment screen refuses such a combination with an
  explanation. Single-scope members and workspace-wide assignments work as today.
- The access-path matrix (D6) records, per module, whether per-assignment scope is enforced.

### 7. Migration

- Each member's base role becomes one assignment at their current scope (workspace-wide, or their unit and place
  grants); an existing custom role becomes a second assignment at the same scope. No member gains or loses access in
  the migration; a reconciliation report compares effective access before and after for every member.

## Threat model (summary)

| Threat | Control |
| --- | --- |
| Widening by combining roles | §1 per-assignment evaluation; §6 transition rule |
| Escalation by editing a shared custom role | Role edits audited, with reason; SoD check on save; members affected listed before save |
| Delegation abuse | Subset of one assignment, no wider scope, time-boxed, audited |
| Stale access after revocation | Session version bump; 300 s context lifetime |
| Jobs acting with stale scope | A job records the assignment it runs under and re-checks on each step |
| Oversized context | Permission sets referenced, not listed; size limit tested |
| Disclosure through refusals | Explanations only within the member's own scope (card R12) |

## Consequences

- Cards: R1 permission vocabulary and one matcher; R2 assignments and migration; R3 segregation of duties; R4
  delegation and revocation; R5 per-module enforcement; R16 personas from assignments.
- Contract changes: `TenantMember` gains assignments (forward migration); `PlatformContextV1` gains assignment claims
  (versioned); the module SDK gains the scope helper.
- ADR-0018's member-level grants become the scope of the member's assignments; its tenant-wide authority for platform
  roles is unchanged until decision D2.
