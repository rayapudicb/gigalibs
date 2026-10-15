# WI-OI-120aw: Clean up certification and test workspaces on UAT

- **Status:** Approved (owner, 2026-10-15: "approved 120at and 120aw"). The plan file is ready for the owner's review.
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

- [ ] The owner approved the plan file (keep or suspend for each active or trial workspace).
- [ ] The owner ran the suspension; the read-only check confirms counts, audit records, and no active sessions in
  suspended workspaces.
- [ ] Dead letters of non-existent tenants deleted; counts recorded.
- [ ] The journey reruns unaffected.

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

