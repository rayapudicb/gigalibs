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

**When:** owner schedules a **deploy day** after Phase A for that batch.

**Where:** `gigalibs-release-wf120u` only.

**Order (no steps skipped):**

1. Path checkout / one release commit from main (product paths only).
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

**Not Phase A:** Table 2 (**120bq**), SPEED UAT (**120cd**), release worktree Dockerfile/apt identity games.
