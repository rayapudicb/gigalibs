# NOW: where the work stands

Updated 2026-10-01 (WI-OI-106 In Progress for completion slice; WI-OI-107, 105, 104 live in Review). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Active implementation item:** WI-OI-106 (F17, Reports v2 completion slice: automated implementation and throwaway proof complete; In Progress pending owner deployment approval and live browser proof). WI-OI-104 (F8, F14), WI-OI-105 (F15) and WI-OI-107 (F10) are done, live and in
  Review. WI-OI-103 is in Review with 103f and the old-engine cleanup open. WI-OI-108 is Proposed.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
- **Running locally (2026-10-01 07:56):** every service is on `2a48e326e327-93674f4f9ea2`; the web is on 5180.
  - Schemas: Analytics 25, Connector Hub 8, Geospatial 8, CMMS 14, Workforce 16; Redis and the kernel worker run.
  - Backups are taken before every deploy run (`infra/compose/backups/`).
  - Live proofs pass: the web proof (14 Playwright tests), the places proof (WI-OI-105) and the packs proof (a pack
    activated in Configuration Studio reaches Workforce and Geospatial; one industry pack at a time).

## What is live for the owner (5180)

- **Connections:** Connector Hub pulls (REST, paging, logins, quarantine, schedules); a pull can go to Analytics, and
  to Geospatial as places (farms, fields, boundaries in GeoJSON or WKT).
- **Analytics:**
  - **Sources:** map pulled records into datasets, with unit conversion and "Place of each record" (a point, or a
    place code); the unplaced count shows on each dataset.
  - **Explore:** any chart type, a Place filter (a farm and its fields), and **Map (places)**; save the question.
  - Dashboards, Reports, Places; every answer honours the member's place scope.
- **Configuration › Industry packs:** the shipped industry and country packs (agriculture starter pack included),
  installed per tenant, then approved, published and activated in Studio; Workforce and Geospatial receive their part.

## Next

- **Owner review & deployment for WI-OI-106:** approve applying Analytics migration 000026 to live database and deploy services.
- **Following items in Foundation Close (`.pi/tasks/FOUNDATION-CLOSE.md`):** the 103 leftovers (F13), WI-OI-108, the fresh-install fix (item 7), the core push intake (item 8), and F3 engine clean-up (item 9). Then the agriculture package.

## Open decisions (owner)

- Approve running Analytics migration 000026 (`000026_report_formats.up.sql`) and deploying WI-OI-106.

- Replay the 980 place facts dead-lettered during the WI-OI-105 swap (test tenants only), or leave them.
- Removing the unregistered Workforce prototype (packs, payroll and others) is a package-inventory (F7) decision.
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
