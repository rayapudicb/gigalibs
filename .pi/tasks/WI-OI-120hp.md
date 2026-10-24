# WI-OI-120hp (R3): segregation of duties

- **Status:** Proposed — net-new control-plane RBAC; needs a design pass before code, plus post-UAT security review.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.8). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

No one person can hold a combination of roles/permissions that lets them both initiate and approve the same
sensitive action (e.g. request and approve an absence or a timesheet; create and approve a pay run). The system
refuses such an assignment, or blocks the second action, with an audited reason.

## Where it lives

The control plane owns roles and assignments (`packages/tenancy-nest` — `assignMemberRole`, custom roles,
`PlatformContextV1` grants). There is **no SoD scaffolding today** (confirmed 2026-10-24). This is platform RBAC,
not a Workforce-module feature, though Workforce four-eyes flows (absence approve, timesheet approve, pay approve)
are the first consumers.

## Design pass needed first (stop-and-ask items)

- The conflict model: declared pairs of conflicting permissions/roles (e.g. `*.request` vs `*.approve` on the same
  entity) — a static catalogue, per-tenant config, or both?
- Enforcement point: refuse at **assignment time** (can't be granted both), at **action time** (four-eyes already
  blocks self-approval per record — is SoD broader?), or both.
- Relationship to existing four-eyes (e.g. `availability.service` absence decisions already forbid deciding your own).

## Done when (to be refined by the design pass)

- [ ] Conflict catalogue defined and reviewed (Security + Product).
- [ ] Assignment and/or action enforcement implemented in the control plane with audit; migrations as needed.
- [ ] Tests: a conflicting assignment is refused/flagged; a non-conflicting one passes; action-time block where chosen.
- [ ] `pnpm verify` clean; UAT proof; independent security review (post-UAT).
