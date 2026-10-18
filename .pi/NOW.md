# NOW: where the work stands (2026-10-18)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous, longer version of
this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

**A new agent taking over starts with [the handover brief](handoff/HANDOFF-2026-10-17.md)**: the rules, the exact
state and the release procedure as it is run. The prompt to paste is [PROMPT-2026-10-17.md](handoff/PROMPT-2026-10-17.md).

## Current step

**Phase 1, W1: [WI-OI-120bh](tasks/WI-OI-120bh.md), correcting 120bf and 120bg** (approved by the owner 2026-10-18).
- **Built in main, not committed:**
  - the fake "Close work order" button is removed;
  - the CMMS entitlement key comes from the manifest (a generated map), not a literal in the code;
  - the journey's supervisor step is split into a real review and an honest sign-off step, which blocks until
    sign-off exists.
- **Independent Security review:** approve with conditions (Sonnet, read-only, 2026-10-18). Its two Lows are fixed.
- **Next:**
  - "commit";
  - a release on `27450b7`;
  - the owner's deploy;
  - the journey.
- **Then:** supervisor sign-off as a real feature (`COMPLETED → CLOSED`, migration 21; its own card). After that,
  W1-B.

## Running on UAT

- **Release `27450b7`** (owner deploy 2026-10-18): `1bb0193` (W1-A), plus `fd63d93` (WI-OI-120bf), plus WI-OI-120bg.
  CMMS is at migration 20. It still has the fake "Close work order" button, which 120bh removes. The button has
  written one note on UAT, in the journey test workspace `journey-d9e3oe` (read-only check, 2026-10-18).
- **Last journey `d9e3oe`** (on `27450b7`): 55 findings (33 layout, 17 accessibility, 5 UX, 0 blockers). The
  supervisor step passed only through the fake button, so the honest count is 1 gap: supervisor sign-off. The
  technician raises, accepts and completes for real.
- **Rollback:** `fd63d93`, whose images and backup `gigalibs_backup_20261018_015612Z` are kept.

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

1. **[WI-OI-120bh](tasks/WI-OI-120bh.md)** on UAT: the review, the release, the owner's deploy and the journey.
2. **Supervisor sign-off** (new card, M): a planner closes a completed work order with a sign-off note, an audit
   record, the outbox event and migration 21. Plan v3 step 1.3 asks that supervisors "close work orders".
3. **W1-B:** add CMMS to `SCOPE_ENFORCING_MODULES` with its context-coverage test. The journey proves that North does
   not see South. Then step 1.2, T3 (WI-OI-120ad), and the Phase 0 leftovers (WI-OI-120aj, WI-OI-120am).

**W2 is decided (owner, 2026-10-18):**
- enterprise accounts only: an administrator creates each user and shares the username and password;
- no outside sign-up, OAuth or email provider;
- no outside service may block development or testing.

See [the Phase 1 order](../docs/plans/phase-1-sizing.md).

## Standing rules

- **Commits:** only on the owner's word "commit".
- **Deploys:** the owner runs each one, from the release worktree with its own deploy tool.
- **Releases:** each one is reviewed by an independent Security reviewer, and its full test suite runs before it is
  cut.
- **Data:** zero mock and zero hard-coding. UAT data is changed only by owner-run, backed-up steps.
