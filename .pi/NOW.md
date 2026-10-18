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
- **Done (committed):** [WI-OI-120fl](tasks/WI-OI-120fl.md) / [WI-OI-120fm](tasks/WI-OI-120fm.md) (F1).
- **Active:** [WI-OI-120fp](tasks/WI-OI-120fp.md) F0.5 UAT deploy + Playwright (owner).
- **Built, not committed:** [WI-OI-120fq](tasks/WI-OI-120fq.md) F2.1 Inventory→Finance relay and inbox (+ module-sdk inbox path for module-host).
- **F0 code** is already on `main` ancestry (`bf049e1`, `2104f91`); UAT needs a release that includes `0d29f8f`+ and owner deploy per 120fp.
- **Parallel (deploy, not code):** [WI-OI-120f](tasks/WI-OI-120f.md) F0.5 Inventory metadata — commit/deploy and
  Playwright on UAT when the owner is ready (`E2E_UAT_ADMIN_*`).
- **Frozen until Table 2 is 100%:** CMMS journey follow-ups ([WI-OI-120bi](tasks/WI-OI-120bi.md),
  [WI-OI-120bj](tasks/WI-OI-120bj.md), W1-B) — not in agent scope until engines are done (owner, 2026-10-18).

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

## Owner gate (2026-10-18): Table 2 before CMMS

**Do not schedule or suggest CMMS / journey / Phase 1 product work** (for example 120bi, 120bj, W1-B) until the
**architectural engines (Table 2: F0–F2 and plan v3 §5A)** are **100% complete** with evidence. CMMS cards stay in the
backlog; they are not "next" for agents.

## Next steps (Table 2 only)

1. **[WI-OI-120fp](tasks/WI-OI-120fp.md):** owner release + deploy; **`pnpm e2e:uat:inventory`** (F0.5 UAT proof).
2. **Commit 120fq** when the owner says so; relay keys + deploy; live receipt→Finance on UAT.
3. **F2 remainder:** posting rules (E2), HTTP handshake script, receipt→journal with book/period on UAT.

**F1** is committed (`0d29f8f`). **F0** product code is in git; UAT closure is 120fp.

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
