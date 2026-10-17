# NOW: where the work stands (2026-10-17)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous, longer version of
this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

**A new agent taking over starts with [the handover brief](handoff/HANDOFF-2026-10-17.md)**: the rules, the exact
state and the release procedure as it is run. The prompt to paste is [PROMPT-2026-10-17.md](handoff/PROMPT-2026-10-17.md).

## Current step

**Phase 1, W1: Fix CMMS window entitlement key ([WI-OI-120bf](tasks/WI-OI-120bf.md)).**
- W1-A deployed to UAT as `1bb0193`. CMMS is at migration 20; 3 tables exist; relays are healthy.
- Journey `bzutxs` ran: 57 findings, 2 blockers. Both blockers traced to a 403 on `GET /api/control/configuration/runtime/manifest/current` ("The requested runtime scope is not available.") because `ModuleWindowConfigurationAdapterV1` expects `physical-operations-cmms` entitlement, while the tenant has `asset-maintenance`.
- Card `WI-OI-120bf` maps `physical-operations-cmms` to `asset-maintenance` to unblock CMMS window rendering.
- Next: `WI-OI-120bf` fix & deploy, then W1-B (unit/place scope enforcement).

## Running on UAT

- **Release `1bb0193`** (owner deploy 2026-10-17): W1-A release candidate (WI-OI-120be), CMMS at migration 20.
- **Last journey `bzutxs`** (on `1bb0193`): 57 findings (17 accessibility, 33 layout, 4 UX, 1 bug, 2 blockers). The 2 CMMS blockers wait on the `WI-OI-120bf` entitlement key fix.
- **Rollback:** `f9de9a3`, whose images are kept.

## Built, not yet on UAT

- **[WI-OI-120ag](tasks/WI-OI-120ag.md):** ships with the CMMS record routes (step 1.3).

## Waiting for the owner

1. Accept WI-OI-120ax, 120az, 120ba and 120bd (on UAT; journeys `aqyb1q`, `asyz8p` and `b0j8mq` confirm them), with
   the other On UAT items below.
2. MFA on `newuser@gigalibs.io`, the only usable platform owner login.
3. The platform roles of `superadmin@gigalibs.io` and the certification test admin (recommended: remove both).
4. Rotate the passwords that appeared in chat or transcripts: the test accounts' shared password, and the journey and
   approver passwords.
5. Step 0.7 b: named reviewers (Security on every deploy, Accounting for posting).
6. Accept, so they become Done, the On UAT items you are satisfied with (for example 120aw, 120at, 120as, 120ak).
7. Change `ANALYTICS_EXPECTED_MIGRATION_VERSION` from 29 to 30 in `modules/analytics-studio/apps/api/.env.example`.
8. Delete `modules/platform-rbac`; run the expired-session clean-up (306 sessions), if not yet done.
9. The plan for `gigalibs-global`: its trial ends 2026-12-16, and every live workspace on UAT is a trial.

## Known and accepted

- `pnpm verify` reports one known deployment-profile drift, `WORKFORCE_API_URL` (`scripts/verify.mjs`,
  `KNOWN_PROFILE_DRIFT`), until the owner decides it. It also reports 12 isolated-database proofs as not run.

## Next three steps

1. **W1-A on UAT** ([WI-OI-120be](tasks/WI-OI-120be.md)): release commit, builds, backup, `--check`, the owner's
   deploy, role sync in `gigalibs-global`, `uatadmin` and `uat-approver`, and the journey. The 2 CMMS blockers should
   clear.
2. **W1-B:** add CMMS to `SCOPE_ENFORCING_MODULES` with its context-coverage test. The journey proves that a North
   technician does not see South's work (needs its own card and review).
3. **Step 1.2, T3** (WI-OI-120ad), then a small release of the Phase 0 leftovers (WI-OI-120aj, WI-OI-120am). The
   remaining 0.8 items go into W1's releases ([the Phase 1 order](../docs/plans/phase-1-sizing.md)).

## Standing rules

- **Commits:** only on the owner's word "commit".
- **Deploys:** the owner runs each one, from the release worktree with its own deploy tool.
- **Releases:** each one is reviewed by an independent Security reviewer, and its full test suite runs before it is
  cut.
- **Data:** zero mock and zero hard-coding. UAT data is changed only by owner-run, backed-up steps.
