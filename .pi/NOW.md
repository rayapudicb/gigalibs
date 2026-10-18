# NOW: where the work stands (2026-10-18)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous, longer version of
this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

**A new agent taking over starts with [the Cursor handover brief](handoff/HANDOFF-2026-10-18-CURSOR.md)**: the
owner's latest order, the exact state, the pending CMMS work and the release procedure. The prompt to paste is
[PROMPT-2026-10-18-CURSOR.md](handoff/PROMPT-2026-10-18-CURSOR.md). The [2026-10-17 brief](handoff/HANDOFF-2026-10-17.md)
keeps the full rules.

## Current step

**Owner, 2026-10-18 (latest): hand over to Cursor.**
1. Finish the pending CMMS work, in order:
   - [WI-OI-120bi](tasks/WI-OI-120bi.md): **built** on main (`b8ded67e`); **release ready** on worktree
     **`38aa3120`** (`deploy-uat.sh --check` passed). **Owner deploy** still pending (UAT is **`3bc0c1f`**).
   - [WI-OI-120bj](tasks/WI-OI-120bj.md), the AR page's fake verification. Proposed.
   - W1-B, CMMS unit and site scope.
2. Then the owner's Table 1 audit prompt in detail: [TABLE-1-AUDIT-PROMPT-2026-10-18.md](handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md).
3. Before T3 (step 1.2), ask the owner whether T3 or the audit comes first.

**Table 2 engines (another agent, 2026-10-18; tracker [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md)):**
- **Built in git:** WI-OI-120fl to 120gb, Finance migrations 10 and 11, Inventory migration 5. Their tests pass (475,
  2026-10-18).
- **Not on UAT.** 5 of the 6 cards checked record no independent Security review, and the accounting sign-off (F2.9)
  is pending.
- **`pnpm verify --audits` found 3 defects from it (2026-10-18):**
  - the Inventory API depends on `document-lifecycle` and `posting-rules`, which are missing from the Docker
    workspace, so the image would not build;
  - Finance writes Inventory's schema (`inventory-receipt-posting-status-sync.ts`, a new layer violation);
  - the inventory-receipts window is stale (S16).
- **Never deploy from the branch.** Table 2 goes to UAT through the release worktree, after its reviews, when the
  owner decides it is its turn.
- **One implementation writer at a time:** the owner confirms which agent writes.

## Running on UAT

- **Release `3bc0c1f`** (owner deploy 2026-10-18), tag `3bc0c1f46c27-b896d4b59517`: `27450b7` plus WI-OI-120bh.
  CMMS is at migration **20**, and every relay is ok.
- **Last journey `dg84u3`** (on `3bc0c1f`): 56 findings (33 layout, 17 accessibility, 5 UX, 1 blocker) — supervisor
  sign-off not built on this release.
- **Rollback:** `27450b7` (images kept), backup `gigalibs_backup_20261018_062008Z`.

## Ready to deploy (owner, WI-OI-120bi)

- **Release worktree** `38aa3120` / tag `38aa3120ebfc-4cb1f260d82b`; backup **`gigalibs_backup_20261018_084749Z`**.
- Deploy from `/Users/rayapudi/dev/gigalibs-release-wf120u` (see [WI-OI-120bi](tasks/WI-OI-120bi.md)). After deploy:
  CMMS migration **21**, then `pnpm e2e:uat:journey`.

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

**Superseded (owner, 2026-10-18, latest: CMMS first, via Cursor; see Current step):**
- the earlier "Owner next: deploy `0a0e787`+" waits;
- Table 2 is never deployed from the branch. When the owner decides it is its turn, it goes through the release
  worktree, after an independent Security review of WI-OI-120fl to 120gb and the F2.9 accounting sign-off.

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
