# NOW: where the work stands

Updated 2026-09-30 by Claude (WI-OI-103e done; D2 closed; the full local stack caught up). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Active work item: WI-OI-103**, the Analytics engine (`.pi/work/WI-OI-103.md`).
  - Done: 103a, 103b, 103d and 103e.
  - Open: 103c (summaries, benchmark) and 103f (manufacturing proof).
  - WI-OI-102 is in Review. WI-OI-104 to WI-OI-108 are Proposed.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
- **Running locally (2026-09-30):** every service is on `85abf9c80a5f-823fa00b1327`.
  - The web is on 5180. The APIs are core, Analytics (schema 20), CMMS (14), Workforce (14), Geospatial (3) and
    Connector Hub (4).
  - Backup before the catch-up: `infra/compose/backups/gigalibs_backup_20260930_024649Z.dump`.
  - The live proof (`live-web.sh`) passed: a real login, signed contexts to Workforce, CMMS and Geospatial, and 14
    Playwright tests.
  - There is no review web on 5190 any more.
- **D2 is closed** (`.pi/work/D2-review-808b8d2.md`):
  - The five other-stream core migrations were already in the database and are now recorded.
  - Its forms routes are contained (unavailable).
  - The rebuild is registered as **WI-OI-108**.

## What is live for the owner (5180)

- **Analytics:**
  - Overview, with the Saved charts tab;
  - Places;
  - **Explore**: any chart type, save the question; in Demo Lab workspaces, the sample farm and formula review;
  - **Dashboards**: shared filters by date and field;
  - **Reports**: CSV from a saved chart or a dashboard.
- **Roles** (Settings → members): Analytics viewer, Analytics analyst and Analytics data steward appear as built-in
  roles for tenants with Analytics. Tenant admins keep `analytics:*`.

## Next

**Owner plan:** foundation until **Sunday 2026-10-04**, then the **agriculture package** for the client capability
pitch (`.pi/proposals/agriculture-package-plan.md`), then back to the rest of the foundation.

1. **Owner review on 5180.** Create a Demo Lab workspace, load the sample farm (Explore), and have a second member
   (Analytics data steward) approve "Yield per hectare". Then build a dashboard and run a report.
2. **Small cleanup:** retire the old Analytics engine that nothing uses: `v1/charts`, `v1/query/run`,
   `ChartService` and `QueryEngineService.runQuery`, with their tests.
3. **From Monday:** the agriculture package. The first versions of connectors, places and the pack are thin.
4. **After agriculture:** 103c, 103f, WI-OI-104 to WI-OI-108.

## Open decisions (owner)

- Drop the empty `gigalibs_platform` schema.
- The `platform-rbac` leftovers.
- The Analyst role has no `analytics:export`, following the plan wording. Change it if the owner wants.
- Revoke old test sessions: 721 sessions are active, mostly test accounts.

## Watch-outs

- One agent in the repository at a time. Commit only on the owner's literal "commit".
- `pnpm verify` reports the deployment-profile `WORKFORCE_API_URL` drift as KNOWN. Do not fix it without the
  owner.
- Other agents' work lands in this repository. Review it before deploying it (the D2 lesson: its migrations had been
  applied by hand without being recorded).

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
