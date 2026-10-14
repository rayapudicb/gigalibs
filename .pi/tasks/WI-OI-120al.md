# WI-OI-120al: Undo the development script's writes on the UAT database

- **Status:** Proposed (owner, 2026-10-14: "card 120al"). Shown to the owner before work starts.
- **Plan step:** execution plan v3 step 0.3b. It runs after WI-OI-120aj part 1 and before step 0.4.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Absorbs:** WI-OI-120aj part 2, decisions D1a and D2a. D3a is unchanged: the stray `gigalibs_assistant` schema is
  left untouched until GU1.
- **Size:** M. The data change is owner-run, after an independent Security review.

## Why

UAT is production (execution plan v3, rule 2). A read-only check on 2026-10-14 found writes there that no release
made. The old `scripts/enable-all-features.mjs` made them; it is now a stub that refuses to run (WI-OI-121f). Other
sessions ran it from development servers against the UAT database:

| When (UTC) | What it wrote | Rows |
| --- | --- | --- |
| 2026-10-09, about 06:47 | Every one of 27 modules ENABLED for every workspace (`tenant_module_entitlements`; `source` PLATFORM_OVERRIDE, `updatedById` `local-development-bootstrap`). Every module key also added to `tenants.features`. | 7,776 entitlements in 288 workspaces: 6,979 created that day, 797 that existed before and were overwritten. The workspaces: 168 active, 17 on trial, 101 cancelled, 2 provisioning. |
| 2026-10-11, 05:20:28 to 05:20:34 | The full wildcard `*` and `assistant:*`, `assistant:read` and `assistant:action` added to members' own permissions (`tenant_members.permissions`) | 444 of 488 members hold `*`: 310 tenant admins, 93 members, 28 managers, 12 viewers, 1 super admin |
| 2026-10-09 to 2026-10-11 | `assistant:preview` and the `gigalibs-assistant` entitlement (WI-OI-120aj findings) | 468 members; 314 workspaces |

**Effect today:**
- **Module switch-ons take effect.** Workspaces can open modules they never chose, including cancelled workspaces and
  contained modules.
- **The wildcard has no effect yet.** The released sign-in code keeps only valid tenant codes from a member's own
  permissions (`isTenantPermissionCode`), so a bare `*` never reaches a session. It is still stored. Any future code
  that reads it unfiltered would give 444 people every permission.
- **`assistant:*` does reach sessions,** but no Assistant route is deployed, so it has no effect yet.

## Design (to be confirmed with the owner)

1. **The reference is the backup taken before the first write:** `gigalibs_backup_20261008_021555Z` (2026-10-08
   02:15Z; checksum verified 2026-10-08).
   - It is restored into an isolated throwaway database: a separate container that the UAT services cannot reach.
     Never into UAT.
   - It is used read-only, then deleted.
2. **A reconciliation report, row by row,** shown to the owner before any change:
   - **Member permissions:**
     - Remove exactly the codes the script added (`*`, `assistant:*`, `assistant:read`, `assistant:action`,
       `assistant:preview`), unless the backup shows the member already held that code.
     - Nothing else in a member's permissions changes. The R2 migrations that ran after the backup stay as they are.
   - **Entitlements:**
     - **A, rows the script created** (not in the backup, created in the script's window, never changed by another
       actor): set to DISABLED, keeping the row with a reason that names this card.
     - **B, rows it overwrote** (in the backup): restore the backup's status, source, reason and actor.
     - **C, rows changed later by a real actor** (another `updatedById` after 2026-10-11): leave them.
     - **D, anything the report cannot place:** listed for the owner, never changed.
   - **`tenants.features`:** restore the backup's list for workspaces that existed then. Workspaces created later keep
     what their creation gave them, minus module keys the script added.
3. **One owner-run script** (`infra/compose/scripts/wi-oi-120al-undo-bootstrap-writes.sh`):
   - It shows the counts first and changes nothing (dry run).
   - `--apply` needs the name of a fresh, verified backup.
   - One transaction makes every change, writes an audit record per workspace, and writes a
     `tenant.entitlements.changed.v1` outbox event for each workspace whose enabled modules change, so windows follow.
   - It prints the counts after.
4. **Prevent a repeat (decision Q2):** development servers must not be able to reach the UAT database.

## Owner decisions

- **Q1, cancelled workspaces (101):**
  - **a (recommended):** treat them like the rest; their entitlements return to the backup's state.
  - **b:** disable every module for cancelled workspaces.
- **Q2, preventing a repeat:**
  - **a (recommended):** a separate development database now. UAT's database credentials appear in no development
    `.env` file. This is the first slice of O1 (step 1.17), brought forward.
  - **b:** wait for step 1.17.

## Proof

- The reconciliation report matches the backup for every row in class B. Class D is empty, or the owner has decided
  each row.
- The dry run's counts equal the report's.
- After `--apply`, read-only:
  - no member holds `*` or an `assistant:` code they did not hold in the backup;
  - no `local-development-bootstrap` entitlement remains ENABLED unless the backup had it ENABLED;
  - the workspaces' enabled modules match the report.
- An independent Security review of the report and the script is recorded before the owner runs it.
- The Workforce journey is rerun afterwards.

## Scope

- **May change:**
  - the isolated reference database (created, then deleted);
  - one owner-run script and its test;
  - the evidence and status files;
  - for Q2a: the development `.env` examples and compose profile only.
- **Must not change:**
  - UAT, except through the owner-run script;
  - any migration;
  - the `gigalibs_assistant` schema (D3a);
  - other sessions' work.

## Done when

- [ ] The report has been shown, and Q1 and Q2 decided.
- [ ] The Security review is recorded.
- [ ] The owner has run the script after a fresh backup, and the read-only check passes.
- [ ] Q2 is done or scheduled.
- [ ] Evidence is recorded, the journey is rerun, and everything is committed on "commit".
