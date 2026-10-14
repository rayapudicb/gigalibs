# WI-OI-120aj: Branch repair: the branch builds from a clean checkout, and the Assistant preview leaves it

- **Status:** Part 1 done (2026-10-14; commits 0ad402a to 9b0c477, with owner decisions E1a, E2a and E3a). Part 2
  (the UAT data) moved into WI-OI-120al, which absorbs D1a and D2a; D3a is unchanged. Security review 2026-10-14: PASS WITH CONDITIONS
  (C1–C5); its findings M1–M4, L1 and L2 are fixed (evidence in `.pi/work/WI-OI-120.md`).
- **Plan step:** execution plan v3 step 0.3 (`docs/plans/gigalibs-execution-plan-v3.md`).
- **Work items:** WI-OI-120; WI-OI-121 for the Assistant records. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M (part 1); part 2 is an owner-run data change, only if the owner chooses it.

## Why

- **A clean checkout of `feat/gigaops-convergence-core` cannot build.** The Assistant commit `0d4585e` imports two
  things nobody committed:
  - `vendor/copilotkit`;
  - `OmnichannelHeaderTrigger`, which exists only in another session's uncommitted softphone drawer change.

  Releases therefore come from a separate release worktree.
- **The branch carries 12 commits that were never reviewed:**
  - 5 Assistant: `e0ec197`, `507e7fa`, `7c15655`, `0d4585e`, `eee6276`;
  - 7 CMMS: `f7cfa7b`, `e1246f8`, `c80ea2b`, `0e2f119`, `54d33bc`, `e723ba1`, `21e13da`.
- **The Assistant preview is not a product.**
  - All 22 cards are hard-coded.
  - The drawer's chat is refused by its own route.
  - The tool registry is not used.
  - Several routes check no permission.
  - The control plane writes straight into the Assistant's schema (`configuration-studio.service.ts`), against the
    "no module reads another's tables" rule.

  Execution plan v3 replaces it with GU1–GU7. The owner chose option A: revert it from the branch.
- **`507e7fa` gives `assistant:*`, `assistant:read` and `assistant:action` to every member's base role, unreviewed.**
- **`0e2f119` is inconsistent.** It lists CMMS migration `000020` in the runtime manifest but leaves
  `CMMS_SCHEMA_CONTRACT_VERSION` (`runtime-config.ts`) and compose's `CMMS_EXPECTED_MIGRATION_VERSION` at 19.
- **Found on the UAT database (read-only, 2026-10-14); no release ever carried any of it:**
  - the `gigalibs_assistant` schema: migration 1 applied 2026-10-10, with 12 threads, 46 messages, 18 policies and 19
    audit events;
  - 468 of 488 members hold `assistant:preview`, the exact permission the preview's gate requires; 452 hold
    `assistant:*` and `assistant:read`, and 444 hold `assistant:action`;
  - 314 of 320 workspaces have the `gigalibs-assistant` entitlement ENABLED and the feature switched on, created
    2026-10-09 to 2026-10-11.

  These were written by development servers running branch code against the UAT database. None is running now.
  Released code (`37e5556`, `4e6f9ef`) grants none of these permissions, and no Assistant route is deployed, so they
  have no effect today. They would open the Assistant to almost everyone the day any Assistant code is deployed.

## Part 1. The branch (owner option A)

1. **Revert the five Assistant commits as ordinary revert commits, newest first:** `eee6276`, `0d4585e`, `7c15655`,
   `507e7fa`, `e0ec197`. Git history keeps every line, so GU1–GU7 can reuse the real parts: the thread tables and
   their migration, the module API, and the signed CMMS call.
   - A dry run in a throwaway worktree, 2026-10-14: no code conflicts, 118 files.
   - It also removes the control plane's write into the Assistant's schema, and `507e7fa`'s grant.
2. **Kept as they are now, despite the revert:**
   - `scripts/enable-all-features.mjs` stays the stub that refuses to run (WI-OI-121f). Reverting would bring back the
     script that switched on every module and gave every member wildcard permissions.
   - `docs/audits/2026-09-09-readiness/iam-containment-manifest.json` keeps its `assistant`, `copilotkit` and
     `gigalibs-assistant` entries.
   - **Records stay:** the WI-OI-121 and 121a–j cards, `.pi/work/WI-OI-121.md`, the two Assistant report JSON files,
     the Assistant plans and source review, the runbook, the release manifest, and `.pi/tasks/WI-OI-120w.md`.
     - Each WI-OI-121 card gets this status: "Reverted from the branch 2026-10-14 (v3 step 0.3); replaced by GU1–GU7;
       its G5–G7 claims are withdrawn".
     - The runbook and the release manifest get a "Withdrawn" banner.
3. **Generated files regenerated** (`pnpm modules:catalog`, the window generator), so the catalogue, navigation and
   permission catalogue no longer list the Assistant.
4. **CMMS version pin raised to 20** for the API (`CMMS_SCHEMA_CONTRACT_VERSION` and cmms-api's
   `CMMS_EXPECTED_MIGRATION_VERSION`), to match migration `000020`. The cmms-migrations runner stays at 19 until step 1.3
   (Security review M3), so a branch-head deploy stops before the unreviewed migration. The migration's own review stays with step 1.3. No other CMMS code changes.
5. **Lockfile:** `pnpm install --frozen-lockfile` passes on a clean checkout.
6. **Not touched:** other sessions' uncommitted and untracked work:
   - the maps page, `AuthAtmosphere.tsx`, the softphone drawer, `PlantSpatial3DViewer.tsx`, `public/images/`;
   - `vendor/`, `__tests__/vendor-copilotkit.test.ts`;
   - the handoff scripts, the 120y card, and the owner's folders.

   The untracked `vendor-copilotkit.test.ts` will fail in this working tree once the vendor wiring is gone. It stays
   untouched; the owning session decides.

**Releases afterwards.** The 7 CMMS commits stay on the branch unreviewed until steps 1.1–1.3. Until then, a release
still comes from the release worktree, built from reviewed commits only. After step 1.3, releases come from the branch.

## Part 2. The UAT data (owner decision; an owner-run script; Security review first)

Removing these changes production data, so it is the owner's call:

- **D1 grants:** remove `assistant:preview`, `assistant:*`, `assistant:read` and `assistant:action` from members'
  permissions (468 members).
  - **a (recommended):** remove them now.
  - **b:** leave them until GU1.
- **D2 entitlements:** the 314 `gigalibs-assistant` entitlements and features.
  - **a (recommended):** set them to DISABLED and switch the feature off. Rows are kept for audit.
  - **b:** leave them until GU1.
- **D3 the stray schema** (`gigalibs_assistant`: 12 threads, 46 messages, 18 policies, 19 audit events).
  - **a (recommended):** leave it untouched. GU1 restores the same migration file, byte for byte, so the ledger
    matches, and GU1 decides the retention of these rows.
  - **b:** drop it after a verified backup.

How it runs:
1. One script that first shows the counts (dry run), then applies them in one transaction with an audit record.
2. A verified backup comes first.
3. An independent Security review before the owner runs it.
4. A read-only check of the counts afterwards.

## Proof

- **A clean throwaway worktree** at the repair commit, with no untracked files and no `vendor/`:
  `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test` and `pnpm verify` pass.
- `git grep` finds no import of `vendor/copilotkit`, no `OmnichannelHeaderTrigger`, and no Assistant permission in the
  base roles.
- The module manifests and S16 checks pass. The catalogue lists no Assistant.
- An independent Security review of parts 1 and 2 is recorded before the next deploy that includes part 1, and before
  part 2 runs.

## Scope

- **May change:**
  - the five reverts and the kept exceptions above;
  - the CMMS version pin;
  - generated catalogue files;
  - status lines and banners on the Assistant records;
  - the plan, `NOW.md`, `WORK_ITEMS.md` and the evidence;
  - for part 2 only: one owner-run data script and its test.
- **Must not change:**
  - other sessions' work;
  - UAT, except through part 2 when the owner runs it;
  - any migration that has run anywhere;
  - CMMS business code.

## Done when

- [ ] The five Assistant commits are reverted, with the listed exceptions, and the Assistant records carry their new
      status.
- [ ] The CMMS version pin is 20.
- [ ] A clean checkout installs, builds, tests and passes `pnpm verify`, with evidence recorded.
- [ ] The Security review is recorded.
- [ ] If chosen: part 2 is run by the owner and checked read-only.
- [ ] The plan, `NOW.md` and `WORK_ITEMS.md` are updated, and everything is committed on "commit".
