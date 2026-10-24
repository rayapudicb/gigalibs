# WI-OI-120hq (R4): delegation and revocation

- **Status:** Proposed — net-new control-plane RBAC; needs a design pass before code, plus post-UAT security review.
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

## Design pass needed first (stop-and-ask items)

- Can a member delegate only what they hold, and only within their own scope (cannot widen)? (Mirror
  `assertBaseRoleWithinOwn` used at invite/assign time.)
- Interaction with R3 (SoD): a delegation must not create a segregation-of-duties conflict for the delegate.
- Expiry mechanism: how a time-bounded assignment lapses (context `exp`, a sweep job, or check-at-use) and how
  revocation propagates to live sessions (session/auth-version bump).

## Done when (to be refined by the design pass)

- [ ] Delegation model defined and reviewed (Security + Product): bounded, scope-limited, revocable, audited.
- [ ] Control-plane implementation: create/revoke delegation, carried in the signed context; migrations as needed.
- [ ] Tests: delegate gains the role within bounds; cannot widen scope; revocation and expiry remove it; audited.
- [ ] `pnpm verify` clean; UAT proof; independent security review (post-UAT).
