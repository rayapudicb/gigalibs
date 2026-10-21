# WI-OI-120gd: CMMS Phase 1 journey 0 blockers on local compose

- **Status:** Built (product, 2026-10-21); journey **0 blockers** deferred until local `cmms-api` matches **`9eb14717`**
- **Work item:** WI-OI-120 (Table 1 row 23 / M-CM1). Evidence in `.pi/work/WI-OI-120.md` and `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** S

## Goal

The tenant-to-value journey completes CMMS (sign-off + North ≠ South) with **0 blockers** against local `http://127.0.0.1:5180`.

## Scope

- **May change:** `e2e/specs/journey-tenant-to-value.spec.ts`, `.pi` evidence only if journey still fails.
- **Must not change:** CMMS import/export files; UAT deploy scripts; production data.

## Done when

- [ ] `bash e2e/run-uat-walkthrough.sh --journey` → 0 blockers; run id recorded in `.pi/NOW.md`
- [ ] [PHASE-1-CM1-CHECKLIST.md](PHASE-1-CM1-CHECKLIST.md) row 1 evidence updated (owner **Done** tick still owner)

## Stop and ask if

- Blockers remain after `f56ae886` and point to product auth/BFF (not journey).

## Notes (2026-10-21)

- Run **`hpbkd4`**: 15 blockers — **Unit types** submit timeout, **Units** form timeout, **no primary tree** / no Approve / no Grant access → org never in force → CMMS cascade (403, units search). Treat as **120gd** until stages 2–3 pass; then re-evaluate stage 5 with **120bu** on UAT (Phase B).
- Run **`hr2zx3`**: **6 blockers** — technician CMMS execution (`cmms.work-orders.write` on REST) + approver UI Approve wait; org/scope largely fixed.
- **Product (WI-OI-120be W1-A):** `RequireAnyPermission` on work-order execution REST routes; `lockForChange` uses `execute-own` scope + assignee check (not in card scope but required for journey stage 5).
- **2026-10-21 (in progress):** journey spec uses `/settings?tab=hierarchy`, `Name (one)`/`Name (many)`, exact Save, Validate + Submit for approval, structure panel Publish/Activate; CMMS WO step resolves North unit id as **admin**; workspace create retries **503 synchronizing**; approver Approve button short timeout.
- Latest run **`hrmlri`**: **6 blockers** — technician **POST …/status** still **403 write** on UAT (fix in git, needs Phase B); labour tab flow updated in journey; stages 6 approver/time flaky. Run **`hrk5y3`**: workspace **503** (retry added).
- Run **`i76bgm`** (2026-10-21, full): **4 blockers** — org/people stages pass; stage 5 only (`403` on `POST …/status`, no Labour tab / complete cascade). Local **`gigalibs-configuration-local-cmms-api-1`** image **`a1765ce6c275-…`** predates **`9eb14717`**. Rebuild **`cmms-api`** on **5180** (release worktree; main worktree refuses UAT compose per **120bo**), then re-run journey.
- **`e2e/run-uat-walkthrough.sh`:** login preflight retries **503** without clearing `uat.env` (uncommitted).
- Journey spec now **fails the test** when blockers &gt; 0.
- Do **not** run `deploy-uat.sh` during this card; Phase B is one batch after git is ready ([CMMS-DEV-THEN-DEPLOY.md](../handoff/CMMS-DEV-THEN-DEPLOY.md)).
- **Phase B UAT release base (owner, 2026-10-21):** branch **`release/speed-uat`** at **`76780730`** (or its successor
  after Claude’s **120cd** deploy)—**not** `9734dca9` alone. CMMS and SPEED must ship on the **same** UAT release train
  or one side drops off UAT.
- **Built in git:** `9eb14717` — execute-own REST + journey (labour tab, 0-blocker assert, tenant 503 retry).
- **Do not** touch `.pi/handoff/REVIEW-REQUEST-WI-OI-120cd.md` (Claude / **120cd**).
