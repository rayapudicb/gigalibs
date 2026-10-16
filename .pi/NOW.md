# NOW: where the work stands (2026-10-15)

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13).
Statuses are in [WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md). The previous,
longer version of this page is kept in [archive/NOW-2026-10-15.md](archive/NOW-2026-10-15.md).

## Current step

**0.8, the follow-ups** (0.6 and 0.7 done; see [WI-OI-120aq](tasks/WI-OI-120aq.md) and
[WI-OI-120ar](tasks/WI-OI-120ar.md)).
- **Done today:**
  - the UAT workspace clean-up ([WI-OI-120aw](tasks/WI-OI-120aw.md)): the owner suspended the 225 test and
    certification workspaces and deleted 1,094 dead letters on 2026-10-16. This closes WI-OI-120ak S7.
  - the owner recovered a platform owner login through the product's assisted reset
    ([WI-OI-120ay](tasks/WI-OI-120ay.md)).
- **Next:**
  - the journey rerun;
  - MFA on that login, and the owner's decision on the other two platform roles;
  - the organization Submit 400 ([WI-OI-120ax](tasks/WI-OI-120ax.md)), waiting for approval. Every registry row now has a status its evidence supports:
94 Replaced (with pointers to plan v3), 14 On UAT, 8 Built, 1 In Progress (WI-OI-120). None is Done yet: Done needs the
owner's recorded acceptance.

## Running on UAT

- **Release `59d286d`** (owner deploy 2026-10-16 05:14Z): `b7632d6` plus WI-OI-120ax, the organization reason guard.
  `b7632d6` carried:
  - step 0.4, the zero-mock sweep: [WI-OI-120ak](tasks/WI-OI-120ak.md) S1–S6, S5b, S5c and L2;
  - step 0.5 (120ai, 120ae, 120af) and 0.5b, the security fixes;
  - relay health ([WI-OI-120as](tasks/WI-OI-120as.md));
  - the unused packages removed;
  - the Master Data Hub retired ([WI-OI-120at](tasks/WI-OI-120at.md)).
- **Last journey `ainvqh`** (on `59d286d`): passed, 54 findings, 2 blockers. Both blockers are CMMS and are fixed in
  step 1.3. The organization Submit 400 is gone.
- **Rollback:** `b7632d6`, whose images are kept.

## Built, not yet on UAT

- **[WI-OI-120ag](tasks/WI-OI-120ag.md):** ships with the CMMS record routes (step 1.3).

## Waiting for the owner

1. Accept WI-OI-120ax (on UAT; journey `ainvqh` confirms it), with the other On UAT items below.
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

1. **0.8:** finish the journey follow-ups:
   - the invitation token;
   - the Settings tab on reload;
   - the journey wrapper's sign-in;
   - the disk guard;
   - 120au (one Master data menu);
   - the Control Tower retired-key hardening;
   - relay stall and failure alerts;
   - the two dead default passwords;
   - the journey's approval chain;
   - an automatic expired-session sweep.
2. **Plan Phase 1 for deadlines:** size each of the 21 steps (S, M or L) and order them into releases.
3. **1.1:** R5 CMMS (WI-OI-120z, 120aa, 120ab, 120ac): Security review, deploy, and unit and site scope. Then 1.2 (T3
   places) and 1.3 (M-CM1, with 120ag and the CMMS migration pin raised to 20).

## Standing rules

- **Commits:** only on the owner's word "commit".
- **Deploys:** the owner runs each one, from the release worktree with its own deploy tool.
- **Releases:** each one is reviewed by an independent Security reviewer, and its full test suite runs before it is
  cut.
- **Data:** zero mock and zero hard-coding. UAT data is changed only by owner-run, backed-up steps.
