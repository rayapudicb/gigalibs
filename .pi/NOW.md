# NOW: where the work stands (2026-10-18)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous, longer version of
this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

**A new agent taking over starts with [the handover brief](handoff/HANDOFF-2026-10-17.md)**: the rules, the exact
state and the release procedure as it is run. The prompt to paste is [PROMPT-2026-10-17.md](handoff/PROMPT-2026-10-17.md).

## Current step

**Table 2 engines only (owner, 2026-10-18).** Agents stay on F0–F2 until the checklist below is fully evidenced; do not
redirect the owner to other product tracks in chat.

- **Committed:** F1 `0d29f8f`; F2.1 `8a5b487`; UAT Playwright `36105e4`.
- **Owner deploy:** [WI-OI-120fp](tasks/WI-OI-120fp.md) + relay keys for F2.1 on module-host.
- **Committed (Table 2):** F2.2 `14845ae` ([WI-OI-120fr](tasks/WI-OI-120fr.md)).
- **Committed:** F2.3 `1e54d17` ([WI-OI-120fs](tasks/WI-OI-120fs.md)).
- **Committed:** F2.4 `631c4c7` ([WI-OI-120ft](tasks/WI-OI-120ft.md)).
- **Committed:** F2.6 `7c1f4c1` ([WI-OI-120fu](tasks/WI-OI-120fu.md)); Finance migration **11**.
- **Committed:** F2.5 `1fadfa4` ([WI-OI-120fv](tasks/WI-OI-120fv.md)); F2.7 [WI-OI-120fw](tasks/WI-OI-120fw.md); Inventory migration **5**.
- **Committed:** F2.8 `930272f` ([WI-OI-120fx](tasks/WI-OI-120fx.md)) — period close blocked when inventory posting reconciliation has gaps.
- **Committed:** F1.3 `de671f0` ([WI-OI-120fy](tasks/WI-OI-120fy.md)) — receipt `complete` on `@gigalibs/document-lifecycle`.
- **Committed:** F1.4 `e7eaa3d` ([WI-OI-120fz](tasks/WI-OI-120fz.md)) — period-lock guard on receipt complete.
- **Committed:** F2.9 packet `0a0e787` ([WI-OI-120ga](tasks/WI-OI-120ga.md)) — accounting review artifact (sign-off pending).

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

**Full Table 2 list (all rows + statuses):** [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md) — read this when you ask “what’s next?”.

## Table 2 — completion checklist (engines only)

| Engine | Code | UAT / evidence still open |
|--------|------|---------------------------|
| **F0** metadata windows | In git (`bf049e1`, `2104f91`, …) | [WI-OI-120fp](tasks/WI-OI-120fp.md): deploy + `pnpm e2e:uat:inventory` |
| **F1** document lifecycle | `0d29f8f` | Finance draft pilot on UAT when F0/F2 release ships |
| **F2.1** Inventory→Finance relay | `8a5b487` | Relay keys, deploy, live receipt→inbox proof |
| **F2.2** posting / GL handoff | `14845ae` | Deploy with F2.1; live journal proof on UAT |
| **F2.3** inbox reconciliation | `1e54d17` | Deploy |
| **F2.4** journal tie-out | `631c4c7` | Deploy; Finance migration **10** on module-host |
| **F2.5** posting status on receipts | `1fadfa4` | Deploy; Inventory migration **5**; `FINANCE_INVENTORY_POSTING_DATABASE_URL` |
| **F2.6** daily reconciliation | `7c1f4c1` | Deploy with migration **11** |
| **F2.7** relay HTTP cert | `1fadfa4` | Isolated proof only (`PROOF_DATABASE_URL`) |
| **F2.8** period-close gate | `930272f` | Deploy with F2 stack; prove lock fails when reconciliation gaps exist |
| **F1.3** receipt lifecycle | `de671f0` | Ships with Inventory deploy |
| **F1.4** period-lock on complete | `e7eaa3d` | Uses module-host `FINANCIAL_OPERATIONS_DATABASE_URL` |

**Table 2 code:** complete through **`0a0e787`**. **Remaining:** UAT evidence + F2.9 accountant ([TABLE-2-UAT-CLOSURE.md](TABLE-2-UAT-CLOSURE.md), [WI-OI-120gb](tasks/WI-OI-120gb.md)).

**Owner next:** deploy **`0a0e787`+** ([WI-OI-120fp](tasks/WI-OI-120fp.md)); agents do **not** run `--deploy`. Then Playwright + F2.9 §6.

**Agent next:** record evidence in `.pi/work/WI-OI-120.md` only after owner supplies tags/run ids/sign-off; say **commit** for closure runbook docs.

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
