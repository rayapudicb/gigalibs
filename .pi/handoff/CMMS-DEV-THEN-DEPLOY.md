# CMMS Phase 1 — develop first, deploy once (owner, 2026-10-21)

Use this when deployment churn is blocking progress. **Phase A** finishes work in git; **Phase B** is one owner half-day.

## Phase A — Development (default)

**Where:** `/Users/rayapudi/dev/gigalibs` only (`feat/gigaops-convergence-core` or branch the card names).

**Do not:** open `gigalibs-release-wf120u`, run `build-images*`, `deploy-uat.sh`, or `backup-uat.sh`.

**Read first each session:** [.pi/NOW.md](../NOW.md) → linked [.pi/tasks/WI-OI-*.md](../tasks/) → [PHASE-1-CM1-CHECKLIST.md](../tasks/PHASE-1-CM1-CHECKLIST.md) (Built-in-git column only).

**Verify (always tee logs):**

```bash
cd /Users/rayapudi/dev/gigalibs
pnpm verify 2>&1 | tee /tmp/gigalibs-verify.log | tail -30
pnpm exec vitest run modules/physical-operations-cmms/apps/api/src 2>&1 | tee /tmp/cmms-test.log | tail -15
```

**Journey during Phase A:** only when a card says so (e.g. [WI-OI-120gd](../tasks/WI-OI-120gd.md)). Prefer fixing **stages 2–3 (org in force)** before treating **stage 5 CMMS** blockers as product defects.

**Readable journey output:**

```bash
pnpm e2e:uat:journey 2>&1 | tee /tmp/journey.log
open e2e/test-results/journey/index.html   # board: blockers by stage
```

**Phase A exit:** every row in PHASE-1-CM1 **Built in git** + card tests green; **120bu**-class CMMS fixes committed on main.

## Phase B — One UAT release (later)

**When:** owner schedules a **deploy day** after Phase A for that batch, **after** Claude’s SPEED UAT release
([WI-OI-120cd](../tasks/WI-OI-120cd.md)) is on the running stack—or in the **same** release train on top of it.

**Where:** worktree on branch **`release/speed-uat`** (e.g. `gigalibs-release-speed`), **not** a fresh cut from
`9734dca9` / `release/wi120u-workforce` alone.

**Release base (owner, 2026-10-21):** stack CMMS (**120gd**, **120bu**, etc.) on **`release/speed-uat` at
`76780730`** (SPEED R1 on the UAT release). Deploying CMMS built only from `9734dca9` **after** SPEED lands would
**remove SPEED from UAT**; deploying SPEED-only on top of an old CMMS-only release does the reverse. One combined
release keeps both.

**Do not:** edit or commit `.pi/handoff/REVIEW-REQUEST-WI-OI-120cd.md` (Claude / **120cd**).

**Order (no steps skipped):**

1. On **`release/speed-uat`**, one release commit from main with **CMMS (and any co-deploy) paths only**—SPEED paths
   stay as Claude left them on that branch.
2. `bash infra/compose/scripts/refresh-source-identity.sh` — write down `REV / STATE`.
3. All five builds (`GIGALIBS_KEEP_IMAGE_VERSIONS=3`) → `tee /tmp/uat-build.log`.
4. `backup-uat.sh` → note basename.
5. **Immediately** `deploy-uat.sh --check` then `--deploy` with that backup (no manual `compose up` between 4 and 5).
6. Journey from main → **0 blockers** → owner ticks PHASE-1-CM1.

**Deploy one-liner outcome:** last line is `CHECK PASSED`, `DEPLOY SMOKE PASSED`, or `FAIL: …` (full log in tee file).

**UAT version check:**

```bash
docker inspect gigalibs-configuration-local-web-1 \
  --format '{{index .Config.Labels "com.gigalibs.release-id"}}'
```

## CMMS M-CM1 dev focus (2026-10-21)

| Priority | Card | Phase A work |
|----------|------|----------------|
| 1 | [WI-OI-120bu](../tasks/WI-OI-120bu.md) | **Built** on main (`c7ee6091`) — assignment scope + technician picker |
| 2 | [WI-OI-120gd](../tasks/WI-OI-120gd.md) | Journey **org stages 2–3** then CMMS **0 blockers** (spec + product if needed) |
| 3 | [WI-OI-120bi](../tasks/WI-OI-120bi.md)–[120be](../tasks/WI-OI-120be.md) | Already on UAT baseline; journey proves sign-off + N/S scope after **120gd** |

**Not Phase A:** Table 2 (**120bq**), SPEED UAT release prep (**120cd** — Claude), release worktree Dockerfile/apt
identity games.

**Unrelated local edits (leave unstaged):** `apps/workflow-platform` maps/auth/communications files are not **120gd**.

## Local 5180: refresh CMMS API only (owner / release worktree)

Main-branch agents must **not** run compose against `gigalibs-configuration-local` (**WI-OI-120bo**). After **`9eb14717`**
is on your branch, rebuild **`cmms-api`** from a **`release/*`** checkout (same repo paths), then recreate the service on
the stack that serves **5180**:

```bash
cd infra/compose
unset GIGALIBS_COMPOSE_ENV_SUFFIX
bash scripts/refresh-source-identity.sh
# build target cmms-api only (see build-module-images.sh row for cmms-api)
docker compose -f compose.yaml -f compose.modules.local.yaml up -d cmms-api --force-recreate
pnpm e2e:uat:journey   # expect 0 blockers when image matches git
```
