# WI-OI-120aw: Clean up certification and test workspaces on UAT

- **Status:** Applied on UAT by the owner (2026-10-16 04:21Z, backup `gigalibs_backup_20261016_035600Z`): 225
  suspended and audited, 1,094 dead letters deleted, the read-back holds; journey `agxc2i` unaffected. Done needs the owner's acceptance.
- **Plan v3:** step 0.8. This settles the old decision D5 on historical proof data. UAT is production (0.7a), so test
  workspaces do not belong there (plan v3 rule 2: test data only in labelled test workspaces).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M (mostly classification and an owner-run step; no product code).

## What UAT holds (read-only, 2026-10-15)

329 workspaces:

| Kind (by name) | Active | Trial | Other |
| --- | --- | --- | --- |
| Certification runs (`wi-oi-038/063/064/064c/064e/065-*`) | 57 | — | 16 cancelled |
| Journey or test-named (`journey`, `e2e`, `proof`, `cert`, `test`, `demo`) | 30 | 31 | 35 cancelled |
| `uat-*` | 1 | 1 | 50 cancelled |
| Everything else | 80 | 26 | 2 provisioning |

The newest of "everything else" are mostly `qual-tenant-*` (qualification runs).

Also:
- 1,102 outbox dead letters belong to certification tenants: Geospatial 980 and Workforce 122 (WI-OI-120as);
- the 3 brand workspaces are handled by WI-OI-120ak S7.

## Design

1. **Classify, read-only.** A plan file lists every workspace with its kind, status, member count, last sign-in,
   created date and data counts. The owner marks the ones to keep: real customers, the journey's own workspace and
   the owner's UAT workspaces. Nothing is kept or removed by name pattern alone.
2. **Suspend, don't delete,** through the product's own path (`PATCH /platform/tenants/:id/status`, as for the brand
   workspaces). It is audited, revokes sessions, and is undone with Reactivate.
   - An owner-run script works from the reviewed plan, using the plan's checksum and a fresh backup, as WI-OI-120al
     did.
   - Already-cancelled workspaces stay as they are.
3. **Dead letters of workspaces that no longer exist** (the 980 and 122) are deleted in the same backed-up step.
   Those of suspended workspaces stay with them.
4. **Deleting data** (hard purge) is a separate, later decision, under the retention rules (T9b), never part of this
   card.

## Done when

- [x] The owner approved the plan file (keep or suspend for each active or trial workspace).
- [x] The owner ran the suspension; the read-only check confirms counts, audit records, and no active sessions in
  suspended workspaces.
- [x] Dead letters of non-existent tenants deleted; counts recorded.
- [x] The journey reruns unaffected (`agxc2i`, 2026-10-16: the same functional findings as `ac0z09`).

## The plan file (2026-10-15, read-only)

`scripts/uat/wi-oi-120aw/plan-2026-10-15.csv`: every ACTIVE, TRIAL or PROVISIONING workspace (228), each with its ID,
slug, name, status, kind, created date, active members, last session, and a proposed action and reason.

- **KEEP (3):**
  - `gigalibs-global`: the main UAT workspace, 5 members, used 2026-10-15;
  - `uatadmin`;
  - `uat-approver`: the homes of the UAT test accounts the other UAT specs sign in as.
- **SUSPEND (225):**
  - 57 certification (`wi-oi-*`);
  - 62 journey or test;
  - 15 qualification (`qual-tenant-*`);
  - 87 named verification runs ("Control Plane Verification", "BFF verification", "Workflow verification and
    isolation", "AP Outcome and Isolation", "Operational Intelligence", "GigaOps P6–P8 web path", "Login repro",
    `tenant-a`/`tenant-b` pairs, "Audit Tenant");
  - 1 `uat-config-restart-*`;
  - the 3 brand workspaces. Suspending them here closes WI-OI-120ak S7.
- **The journey is unaffected:** it creates its own workspace and sign-ups on every run
  (`journey.<role>.<run>@gigalibs.test`).
- The owner edits the action column, then approves; the plan's checksum is then fixed for the run.

## Plan approved (owner, 2026-10-16: "plan approved as is")

- `scripts/uat/wi-oi-120aw/plan-2026-10-15.csv`, committed in `e3fb0ff` and unchanged since: sha256 `d3df8ec6f5ee9f53a1964ac9d332503ae4f9354fb967824b1759510399f32f84`.
- KEEP 3, SUSPEND 225. The suspension script refuses any other plan content.

## The suspension script (2026-10-16): built, checked read-only on UAT

`scripts/uat/wi-oi-120aw/suspend.mjs`, with `lib.mjs` and `lib.test.mjs`.

- **Check (default, read-only):** it accepts only the approved plan (sha256 pinned). It compares every planned
  workspace with its live status and counts the dead letters. It refuses if anything moved.
- **Apply:**
  1. It needs a verified backup less than an hour old: checksum, metadata, and a `pg_restore` listing that holds the
     tenants, sessions, audit and both outbox tables.
  2. It signs in as the owner's platform login, the way the browser does. The password is read from the environment,
     never from the command line. It refuses an MFA login and a login without platform authority. It also refuses a
     session bound to a workspace being suspended, since that session would be revoked part-way.
  3. It suspends each workspace through `PATCH /api/control/platform/tenants/:id/status`, one at a time and under
     the request budget, honouring `Retry-After`. Each suspension records the reason "WI-OI-120aw (plan
     d3df8ec6f5ee): <the plan's reason>". It stops at the first failure; a rerun resumes, skipping workspaces
     already suspended.
  4. It then deletes the dead letters of workspaces that do not exist, in one transaction that raises and deletes
     nothing unless the counts are exactly 980 (Geospatial) and 114 (Workforce).
  5. It reads everything back.
- **Verify (read-only):**
  - 225 suspended;
  - the 3 kept workspaces unchanged;
  - 225 audited status changes carrying this run's reason;
  - no active session in a suspended workspace;
  - no orphaned dead letter.
- **Evidence:**
  - 10 tests pass (`node --test scripts/uat/wi-oi-120aw/lib.test.mjs`); Biome is clean.
  - Check on UAT (read-only, 2026-10-16 02:30Z): 225 to suspend, 0 already suspended, 0 moved, 0 missing; dead
    letters 980 and 114.
  - Verify before the run reports, as expected: 0 suspended, 3 kept unchanged, 0 audited, 247 active sessions in
    the workspaces to suspend, and the 980 and 114 dead letters.
  - The dead-letter deletion was rehearsed in a throwaway PostgreSQL:
    - with 979 rows it raises and deletes nothing;
    - with 980 and 114 it deletes exactly those, and keeps the live workspace's dead letters and every PENDING or
      PUBLISHED row.
  - Both platform routes answer 401 without a session.
- **Undo:** Reactivate (`ACTIVE`) per workspace. The status route cannot set TRIAL, so the 55 trial and 2
  provisioning workspaces come back as ACTIVE; for an exact undo, restore from the backup.
- **Not touched:**
  - workspaces created after the plan (for example today's journey workspace `journey-ac0z09`);
  - the 8 Workforce dead letters of `wi-oi-065-web-…` (they stay with their suspended workspace).

