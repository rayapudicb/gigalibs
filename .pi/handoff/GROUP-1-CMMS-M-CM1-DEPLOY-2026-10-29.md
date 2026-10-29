# Deploy sequence Group 1 — CMMS M-CM1 (owner)

**Audience:** Owner / release operator. **Agents do not deploy** (AGENTS.md, WI-OI-120bo).

**Goal:** One UAT release that satisfies [PHASE-1-CM1-CHECKLIST.md](../tasks/PHASE-1-CM1-CHECKLIST.md) (sign-off, scope, record routes, W1-A/B). Journey target: **0 CMMS blockers** ([WI-OI-120gd](../tasks/WI-OI-120gd.md) run **`jsjmyx`** on git with **`9eb14717`**+).

**Current git (dev branch):** `feat/gigaops-convergence-core` @ **`29aab729`** (includes CMMS mig **24**, **`9eb14717`** execute-own, **`c7ee6091`** 120bu assignment scope). **UAT baseline (2026-10-18):** release **`1d8d2634`**, CMMS mig **22**.

---

## 0. Read first

1. [CMMS-DEV-THEN-DEPLOY.md](./CMMS-DEV-THEN-DEPLOY.md) — Phase B order (backup → build → check → deploy).
2. [HANDOFF-2026-10-18-CURSOR.md](./HANDOFF-2026-10-18-CURSOR.md) — release worktree + `deploy-uat.sh` location.
3. [PHASE-1-CM1-CHECKLIST.md](../tasks/PHASE-1-CM1-CHECKLIST.md) — five rows to tick **Done**.

**Coexistence with SPEED on UAT:** If the running stack includes SPEED ([WI-OI-120cd](../tasks/WI-OI-120cd.md)), cut the release from **`release/speed-uat`** (or successor), not an old CMMS-only tag alone — see CMMS-DEV-THEN-DEPLOY Phase B.

---

## 1. Preflight (main or release worktree)

```bash
cd /Users/rayapudi/dev/gigalibs   # or release worktree checkout
node scripts/verify-migration-pins.mjs          # expect: CMMS job/api/code = 24
pnpm exec vitest run modules/physical-operations-cmms/apps/api/src | tail -5
```

Optional hygiene on main before cutting release: uncommitted **AR migration pin 19** (if still open) — run `node scripts/verify-migration-pins.mjs` after merge.

**CMMS schema jump on deploy:** `000023_asset_downtime_maasa`, `000024_cmms_analytics_downtime_relay` (IoT/MaaS handoff with Analytics inbox keys). Ensure `ANALYTICS_CMMS_INBOX_RELAY_*` / compose env match [generate-relay-credentials.sh](../../infra/compose/scripts/generate-relay-credentials.sh) if relay proofs are in scope.

---

## 2. Release worktree (required)

1. Create/update worktree on a **`release/*`** branch (not raw `feat/gigaops-convergence-core` on UAT compose from main — **120bo**).
2. Cherry-pick or merge **CMMS M-CM1 slice** at minimum:
   - `modules/physical-operations-cmms/**`
   - `modules/physical-operations-cmms/web/**` (if window/sign-off UI changed)
   - `e2e/specs/journey-tenant-to-value.spec.ts` (120gd)
   - `packages/contracts` CMMS types if changed
   - Compose pins already at **24** in `infra/compose/compose.modules.local.yaml`
3. **Do not** drop SPEED paths if UAT must keep SPEED ([120cd](../tasks/WI-OI-120cd.md)).

Record one release commit SHA → tag for rollback.

---

## 3. Build and deploy (owner)

From release worktree (scripts per [WI-OI-120bi](../tasks/WI-OI-120bi.md)):

```bash
bash infra/compose/scripts/refresh-source-identity.sh   # note REV / STATE
# Full or CMMS-focused image build — at minimum cmms-api + web serving 5180
GIGALIBS_KEEP_IMAGE_VERSIONS=3 bash infra/compose/scripts/build-module-images.sh …
bash infra/compose/scripts/backup-uat.sh              # note backup name
bash .pi/handoff/proof-scripts/deploy-uat.sh --check
bash .pi/handoff/proof-scripts/deploy-uat.sh --deploy --backup <backup>
```

Expect: **`CHECK PASSED`**, **`DEPLOY SMOKE PASSED`**, migration job **cmms-migrations** completes at version **24**, `cmms-api` healthy.

**Local 5180 CMMS-only refresh** (journey before full deploy): [CMMS-DEV-THEN-DEPLOY.md § Local 5180](./CMMS-DEV-THEN-DEPLOY.md).

---

## 4. Journey proof → Done

From **main** (journey spec tracks latest):

```bash
pnpm e2e:uat:journey 2>&1 | tee /tmp/journey-m-cm1.log
open e2e/test-results/journey/index.html
```

**Pass:** **0 CMMS blockers** (Workforce blockers may remain — deferred to Group 5 per 120gd).

Tick [PHASE-1-CM1-CHECKLIST.md](../tasks/PHASE-1-CM1-CHECKLIST.md) rows 1–5; update `.pi/WORK_ITEMS.md` / cards **120bi**, **120bk**, **120be** to **Done** with journey run id + release tag.

---

## 5. After Group 1

Deploy sequence **Group 2** (Mobile BFF) per AGENTS.md — do not start until Group 1 acceptance is recorded.

**Not in M-CM1:** Table 2 Finance batch (**120bq**), seven-module iDempiere batch (WI-OI-122–129), `/cmms/analytics` depth.

---

## 6. Rollback

Pre-deploy backup from step 3. CMMS down: apply **`000024`/`000023` down** only via controlled rollback plan in release notes; prefer redeploy previous image tag + backup restore per [NOW.md](../NOW.md) UAT rollback lines.
