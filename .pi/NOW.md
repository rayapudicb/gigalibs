# NOW: where the work stands (2026-10-18)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous, longer version of
this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

**A new agent taking over starts with [the handover brief](handoff/HANDOFF-2026-10-17.md)**: the rules, the exact
state and the release procedure as it is run. The prompt to paste is [PROMPT-2026-10-17.md](handoff/PROMPT-2026-10-17.md).

## Current step

**Table 2 (architecture), owner 2026-10-18:** Claude stopped; Cursor continues engines after CMMS journey proof.
- **[WI-OI-120bh](tasks/WI-OI-120bh.md) is on UAT** (`3bc0c1f`, journey `dg84u3`).
- **Done (committed, not on UAT until owner deploy):** [WI-OI-120fl](tasks/WI-OI-120fl.md) (F1.1) and
  [WI-OI-120fm](tasks/WI-OI-120fm.md) (F1.2) — `@gigalibs/document-lifecycle` and Finance journal-draft transitions.
- **Next Table 2:** F2 first posting chain (E3) or finish [WI-OI-120f](tasks/WI-OI-120f.md) F0.5 Inventory deploy on UAT.
- **Parallel (deploy, not code):** [WI-OI-120f](tasks/WI-OI-120f.md) F0.5 Inventory metadata — commit/deploy and
  Playwright on UAT when the owner is ready (`E2E_UAT_ADMIN_*`).
- **Deferred until owner chooses:** [WI-OI-120bi](tasks/WI-OI-120bi.md) supervisor sign-off (journey's one known
  blocker); [WI-OI-120bj](tasks/WI-OI-120bj.md); W1-B scope switch-on.

## Running on UAT

- **Release `3bc0c1f`** (owner deploy 2026-10-18), tag `3bc0c1f46c27-b896d4b59517`: `27450b7` plus WI-OI-120bh.
  `27450b7` was `fd63d93` (WI-OI-120bf) plus WI-OI-120bg; `fd63d93` was `1bb0193` (W1-A, WI-OI-120be) plus WI-OI-120bf.
  CMMS is at migration 20, and every relay is ok.
- **Last journey `dg84u3`** (on `3bc0c1f`): 56 findings (33 layout, 17 accessibility, 5 UX, 1 blocker).
  - The technician raises a request, the supervisor assigns a work order, and the technician completes it, all for
    real.
  - The one blocker is the known gap: supervisor sign-off is not built yet (WI-OI-120bi).
- **Rollback:** `27450b7` (images kept), backup `gigalibs_backup_20261018_062008Z`.

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

1. **[WI-OI-120bi](tasks/WI-OI-120bi.md), supervisor sign-off** (M). A planner closes a completed work order with a
   note, and the person who completed it cannot. It comes with an audit record, the outbox event and migration 21.
   The journey's last CMMS blocker then clears for real.
2. **[WI-OI-120bj](tasks/WI-OI-120bj.md)** (S): no screen claims a verification it did not make.
3. **W1-B:** add CMMS to `SCOPE_ENFORCING_MODULES` with its context-coverage test, and prove in the journey that
   North does not see South. Then step 1.2, T3 (WI-OI-120ad), and the Phase 0 leftovers (WI-OI-120aj, WI-OI-120am).

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
