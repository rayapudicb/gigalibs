# NOW: where the work stands

Updated 2026-09-30 by Claude (WI-OI-105 done and live; F8, F14 and F15 closed). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **No active implementation item.** WI-OI-104 (F8, F14) and WI-OI-105 (F15) are done, live and in Review. WI-OI-103 is
  in Review with 103f and the old-engine cleanup open. WI-OI-106 to WI-OI-108 are Proposed.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
- **Running locally (2026-09-30 23:18):** every service is on `042d22787b32-d3e901751025`; the web is on 5180.
  - Schemas: Analytics 25, Connector Hub 8, Geospatial 6, CMMS 14, Workforce 14; Redis and the kernel worker run.
  - Backup before the WI-OI-105 migrations: `infra/compose/backups/gigalibs_backup_20260930_170556Z.dump`.
  - Live proofs pass: the web proof (14 Playwright tests) and the places proof (a member scoped to Farm B sees only
    Farm B on the place map).

## What is live for the owner (5180)

- **Connections:** Connector Hub pulls (REST, paging, logins, quarantine, schedules); a pull can go to Analytics, and
  to Geospatial as places (farms, fields, boundaries in GeoJSON or WKT).
- **Analytics:**
  - **Sources:** map pulled records into datasets, with unit conversion and "Place of each record" (a point, or a
    place code); the unplaced count shows on each dataset.
  - **Explore:** any chart type, a Place filter (a farm and its fields), and **Map (places)**; save the question.
  - Dashboards, Reports, Places; every answer honours the member's place scope.

## Next

**Owner plan (2026-09-30):** close the rest of the foundation before the agriculture package
(`.pi/tasks/FOUNDATION-CLOSE.md`): WI-OI-107 (F10), WI-OI-106 (F17), the 103 leftovers, WI-OI-108, the fresh-install
fix (item 7) and the core push intake (item 8). Then the agriculture package.

## Open decisions (owner)

- Replay the 980 place facts dead-lettered during the WI-OI-105 swap (test tenants only), or leave them.
- CMMS and Workforce give a member only their exact assigned place; Analytics (and the platform contract) include
  everything inside it. Align them or keep the stricter rule.
- Fresh install fails on an empty database (two migration problems, `.pi/tasks/FOUNDATION-CLOSE.md` item 7).
- Drop the empty `gigalibs_platform` schema; the `platform-rbac` leftovers.
- The Analyst role has no `analytics:export`, following the plan wording. Change it if the owner wants.
- Revoke old test sessions: 721 sessions are active, mostly test accounts.
- Confirm ADR-0017 (kernel jobs).

## Watch-outs

- One agent in the repository at a time. Commit only on the owner's literal "commit".
- `pnpm verify` reports the deployment-profile `WORKFORCE_API_URL` drift as KNOWN. Do not fix it without the
  owner.
- Deploy consumers before producers (Analytics, then Geospatial, then Connector Hub), or a relay dead-letters the
  facts it sends in between (the WI-OI-105 lesson; `deploy-104c.sh` does this now).
- The Mac's disk sits near the 60 GB build floor; builds may need the cache trimmed first.
- Other agents' work lands in this repository. Review it before deploying it (the D2 lesson: its migrations had been
  applied by hand without being recorded).

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
