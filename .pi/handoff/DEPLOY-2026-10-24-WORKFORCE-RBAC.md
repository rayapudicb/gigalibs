# Deploy handoff — Workforce B1–B5 + RBAC (R3/R4) + R5 scope (2026-10-24)

Written for: the owner, who runs the deploy. The session (Claude) prepares and hands off; it does not deploy.
UAT is production — an independent Security review of this set happens **post-UAT** (owner decision 2026-10-22).

## What to release

The 15 contiguous commits `6ecca404..f21cbf0e` on `feat/gigaops-convergence-core` (all WI-OI-120, Workforce/RBAC):

- **B1 (WI-OI-120hj)** `6ecca404`, `ab72d957` — person-login link `requireWorker`; write contract rejects a
  non-UUID `platformUserId`.
- **Phase-2 decisions (docs)** `d1b73641` Jobs stays a workbench component; `9d258ffd` triage; `8446c457` R5 audit;
  `f2894038` R3/R4 designs.
- **R3 segregation of duties (WI-OI-120hp)** `a96b2ee9`, `fbab4f18`, `d8f833b7`, `64d41b19` — enforcement in
  `assignMemberRole`, acceptance table, accept/revoke; routes.
- **R4 delegation (WI-OI-120hq)** `62c4ce88`, `f21cbf0e` — delegation columns, `delegateRole`/`revokeDelegation`,
  live-only mint; routes.
- **R5 scope (WI-OI-120ho)** `cb8295f2`, `25e7b9a5`, `8e0bb21d` — unit+place scope-by-assignment on the person reads.

Shared branch: do not deploy the whole branch (it carries ~208 other, unreviewed commits).

## Release assembly — dry-run verified clean (2026-10-24)

Target line: **`release/wi120u-workforce`** (worktree `gigalibs-release-wf120u`), the Workforce release line (UAT is
assembled per-domain from its own release worktrees; the current UAT points are CMMS `1d8d2634`, SPEED `a1eb8242`,
etc. — none is an ancestor of this feature branch).

A **non-destructive dry-run** (throwaway detached worktree at `9734dca9`, then `git cherry-pick 6ecca404^..f21cbf0e`)
proved the 15 commits apply with **no product-code conflict** — the only conflict is `.pi/NOW.md` (the status index),
resolved by taking the incoming version. So the delta is cleanly isolatable; it does not depend on the branch's other
commits for code.

Assembly steps (owner):
1. **Clear the release worktree first** — `gigalibs-release-wf120u` currently has an uncommitted
   `infra/compose/docker/Dockerfile` change (+ untracked proof-scripts); commit or stash it before assembling.
2. In that clean worktree: `git cherry-pick 6ecca404^..f21cbf0e`; when `.pi/NOW.md` conflicts, take the incoming
   version (`git checkout --theirs .pi/NOW.md && git add .pi/NOW.md && git cherry-pick --continue`). No other conflicts expected.
3. Then build + back up (the session can do these once the worktree is clean) and deploy with your tool.

## Migrations (control-plane DB only; both additive, low risk)

- `packages/db/migrations/20261024000000_duty_conflict_acceptance` — new `duty_conflict_acceptances` table.
- `packages/db/migrations/20261024010000_role_delegation_columns` — nullable `delegatedById`/`effectiveFrom`/
  `effectiveTo` on `member_role_assignments`.

**No new Workforce-schema migration** — R5 is code-only (uses the existing `runtime-foundation` chain). Workforce
migration version is unchanged.

## Prerequisites before building

1. **Stash other sessions' uncommitted work** (not part of this release): `WI-OI-120ce.md`, `maps/page.tsx`,
   `AuthAtmosphere.tsx`, `OmnichannelSoftphoneDrawer.tsx`, and the untracked `handoff/`, `PlantSpatial3DViewer.tsx`,
   `public/`, `modules/communications-textfly/`, `modules/platform-rbac/`, etc. — `git stash -u` before any
   `build-*.sh`, pop only after images finish, verify checksums.
2. Then build + back up (the session can do these and hand you the deploy command); you run the deploy with your tool.

## After deploy — config actions (the B1 UAT fix)

1. In Configuration Studio, **republish the `wf-resources` window** (so `platform-user-id` renders as the
   workspace-member LookupInput, not a text box) and the **`wf-my-absences` window** (absence-type LookupInput).
2. **Delete the test Workforce person** that has an email stored in `platform_user_id`; re-create them via the
   lookup so the UUID is stored. (The tightened contract now also rejects a non-UUID at the API.)

## Post-deploy verification

- **Journey `jsjmyx`** (Workforce): B1 clock-in links; B2 submit week; B3 absence type picker; B4 approver sees the
  week; B5 approver sees the absence.
- **SoD / delegation**: granting a role that pairs request+approve (or manage+approve) is refused unless an admin
  records an acceptance; a delegated role works within its window and stops when revoked/expired.
- **R5 North≠South**: a supervisor scoped to one place/unit does not see the other's people, absences or working
  weeks. (Enforced for a caller whose context carries a place/unit scope; the `SCOPE_ENFORCING_MODULES` allow-list
  flip that lets gigaops roles be *granted* at a scope is still gated — see WI-OI-120ho.)

## Still gated (not in this release)

T1c (CMMS→Workforce projection, ADR-level), R5 allow-list flip (reference-data decision), R5 Geospatial (separate
module), the Assistant part of 2.1 (needs GU1–GU7). The post-UAT independent Security review covers R3/R4/R5.
