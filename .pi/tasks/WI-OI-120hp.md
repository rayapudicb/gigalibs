# WI-OI-120hp (R3): segregation of duties

- **Status:** Built (2026-10-24) — catalogue + detection (contracts, unit-tested); control-plane wiring (grant-time enforcement, acceptance table/migration, accept/revoke methods) integration-tested against a throwaway PostgreSQL 16; **HTTP routes added** (`POST current/members/:memberId/duty-conflicts` + `…/:acceptanceId/revoke`, `roles:assign`). Open: independent Security review (post-UAT).
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

## Design (2026-10-24) — for owner + Security sign-off

**Conflict model — a declared catalogue, like the permission catalogue.** Each module (and the platform) declares
*duty-conflict sets*: groups of permissions no single person should hold together, with a stable id and a reason.
Static in `@gigalibs/contracts` (versioned, reviewable), generated into the same place as `modulePermissionCatalogue`
so `pnpm verify` checks every referenced code exists. First entries (the existing four-eyes pairs, now enforced at
grant time too):
- `workforce.absences.request(-own)` ⊗ `workforce.absences.approve`
- `workforce.time.punch`/`time.manage` ⊗ `workforce.timesheets.approve`
- `workforce.pay.manage` ⊗ `workforce.pay.approve`
- (platform) role-granting ⊗ the thing granted, where applicable.

**Enforcement — grant-time primary, action-time kept as defence in depth.** This is why: SoD is about *who can hold
the combination*, which is an assignment property; blocking only at action time lets a toxic combination sit latent.
- Add `assertNoDutyConflict(resultingPermissions)` beside the existing `assertScopesConsistent` in
  `assignMemberRole` (and the R4 delegation path). It computes the member's permissions across **all** live
  assignments (same union the context is built from) and refuses if any declared conflict set is fully satisfied,
  naming the conflict and the two codes.
- Keep the existing record-level four-eyes (absence/timesheet/pay self-approval already blocked) — unchanged; SoD is
  the broader role-combination guard, four-eyes is the per-record backstop.

**Compensating control (small orgs can't always separate duties).** A workspace administrator may record an
*accepted* conflict for a specific member + conflict-set, with a mandatory justification; the grant then proceeds and
the acceptance is audited (`PERMISSION_CHANGE`, resource `duty_conflict_acceptance`). Without an acceptance, the
grant is refused. This mirrors standard SoD practice and keeps the platform usable for a two-person team.

**Data:** a small `duty_conflict_acceptance` table (tenantId, userId, conflictSetId, reason, acceptedById, createdAt,
revokedAt) — forward migration. No change to the signed context (SoD is decided at grant time; the context is unchanged).

## Done when

- [x] Conflict catalogue + `dutyConflicts` detection in `packages/contracts/src/rbac/duty-conflicts.ts`, with a
      catalogue-coverage test (no set references an unknown code). 8 unit tests pass; contracts build clean.
- [ ] Reviewed by Security + Product (the catalogue, e.g. whether `time.punch` should ever be a side — kept out for now).
- [ ] `assertNoDutyConflict` wired into `assignMemberRole` and the delegation path, with the acceptance override; audited. *(stack)*
- [ ] `duty_conflict_acceptance` migration with verification + roll-forward. *(stack)*
- [ ] Integration tests: conflicting grant refused; accepted-override proceeds + audited; non-conflicting grant passes; revoked acceptance re-blocks. *(stack)*
- [ ] `pnpm verify` clean; UAT proof; independent security review (post-UAT). Evidence in `.pi/work/WI-OI-120.md`.
