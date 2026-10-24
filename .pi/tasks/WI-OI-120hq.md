# WI-OI-120hq (R4): delegation and revocation

- **Status:** Core built (2026-10-24) — `validateDelegation`/`scopeWithin`/`delegationBounds` in contracts, unit-tested. Control-plane wiring (migration, create/revoke, context mint, sweep) pending a stack + Security sign-off.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.9). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

A role holder (or an administrator) can delegate a role to another member for a bounded time — e.g. a supervisor
delegates approval authority while on leave — and that delegation can be revoked early. Every grant and revocation
is audited, the delegate's context reflects it while live, and it lapses automatically at its end.

## Where it lives

The control plane owns roles, assignments and the signed context (`packages/tenancy-nest`;
`PlatformContextAssignmentsSchema` already carries per-assignment grants). There is **no delegation scaffolding
today** (confirmed 2026-10-24). A delegation is a time-bounded, revocable, audited assignment that must flow into
the minted `PlatformContextV1` so modules enforce it unchanged.

## Design (2026-10-24) — for owner + Security sign-off

**A delegation is a time-bounded, revocable, audited role assignment of a role the grantor already holds.** Model it
as a `memberRoleAssignment` with delegation fields rather than a parallel system, so it reuses every existing guard
and the context build:
- New columns on `memberRoleAssignment` (forward migration): `delegatedById` (the grantor — distinct from
  `grantedById`, which may be an admin acting), `effectiveFrom` and `effectiveTo` (**both required** for a
  delegation; a plain assignment leaves them null). Existing `scope`/`unitIds`/`placeIds`/`revokedAt`/`reason` reused.

**Grant rules (reuse the existing assignMemberRole guards):**
- `assertGrantWithinOwn` — the grantor may delegate only permissions they themselves hold. A delegate cannot be
  given more than the grantor has.
- Scope cannot widen — the delegation's scope must be within the grantor's own scope (same resolve/consistency checks;
  `assertScopesConsistent` across the delegate's live assignments).
- `assertNoDutyConflict` (R3) on the delegate's resulting permissions — a delegation that creates an SoD conflict is
  refused unless an acceptance exists.
- Counts toward `MAX_MEMBER_ROLE_ASSIGNMENTS`; `effectiveTo` must be in the future and bounded (cap the horizon, e.g. ≤ 90 days, owner to set).

**Carriage — no signed-context change.** A live delegation rides as an ordinary `PlatformContextAssignment` item
(the same `grants` bitmap + `scope`); modules enforce it exactly like any assignment and need not know it is a
delegation. The "delegation-ness" (grantor, bounds) lives only in the control-plane record. This deliberately avoids
a `PlatformContextAssignmentsSchema` shape change and the verifier deploy-ordering constraint (L1).

**Expiry — mint-time filtering, bounded `exp`, sweep backstop:**
- The control plane includes a delegation in a minted context **only while live** (`effectiveFrom ≤ now < effectiveTo`
  and not revoked), and sets the context `exp` no later than the nearest live assignment's `effectiveTo` — so a cached
  context can never carry an expired delegation.
- A periodic sweep marks lapsed delegations (for listings/audit) and is the backstop; it is not the primary gate.

**Revocation (early):** set `revokedAt` + reason and bump the delegate's `auth_version` (mirrors `revokeMemberRole`),
so live sessions drop it on their next context refresh. Audited.

**Audit:** create, revoke and lapse each write `PERMISSION_CHANGE` / resource `role_delegation`, with grantor,
delegate, role, scope, bounds and reason.

## Done when

- [x] Within-own + scope-not-widened + bounds rules in `packages/contracts/src/rbac/role-delegation.ts`
      (`validateDelegation`, `scopeWithin`, `delegationBounds`). 13 unit tests pass; contracts build clean.
- [ ] Reviewed by Security + Product (bounds horizon cap, unit descendant-expansion resolved upstream of `scopeWithin`).
- [ ] `memberRoleAssignment` delegation columns migration (verification + roll-forward). *(stack)*
- [ ] Create/revoke delegation in the control plane: calls `validateDelegation` + R3 `dutyConflicts` on the delegate's union; audited. *(stack)*
- [ ] Mint-time live-only inclusion + `exp` bounding; sweep backstop; `auth_version` bump on revoke. *(stack)*
- [ ] Integration tests: delegate gains the role within bounds; cannot widen or exceed the grantor; expiry and revoke remove it; SoD conflict refused; all audited. *(stack)*
- [ ] `pnpm verify` clean; UAT proof; independent security review (post-UAT). Evidence in `.pi/work/WI-OI-120.md`.
