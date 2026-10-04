# NOW: where the work stands

Updated 2026-10-04 (WI-OI-118 in Review; WI-OI-117 committed d731c05 in Review; WI-OI-116 committed babd0b9 in Review; WI-OI-115 committed 51c9ad8 in Review; WI-OI-114 committed eb7391a in Review; WI-OI-095 committed b799abd in Review; WI-OI-094 committed a8207c4 in Review; WI-OI-113 committed e532d98 in Review; WI-OI-093 committed 5d1aa3a in Review; WI-OI-092 committed 155061d in Review; WI-OI-091 committed 2890f10 in Review; WI-OI-112 in Review committed 2f18945; WI-OI-111 committed ad7f83b; WI-OI-110 in Review). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Active implementation item:** none (WI-OI-118 in Review; task card `.pi/tasks/WI-OI-118.md`). Phase 14 Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine complete. All 18 verification steps in `pnpm verify` pass cleanly. WI-OI-117 committed `d731c05` in Review. WI-OI-116 committed `babd0b9` in Review. WI-OI-115 committed `51c9ad8` in Review. WI-OI-114 committed `eb7391a` in Review. WI-OI-095 committed `b799abd` in Review. WI-OI-094 committed `a8207c4` in Review. WI-OI-113 committed `e532d98` in Review. WI-OI-093 committed `5d1aa3a` and in Review. WI-OI-092 committed `155061d` and in Review. WI-OI-091 committed `2890f10` and in Review. WI-OI-112 is committed `2f18945` and in Review. WI-OI-111 committed `ad7f83b` and in Review. WI-OI-110 in Review, committed `917141a`.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has not started.
- **Running locally (2026-10-02 14:16 IST):** every application service is on `3da222030dc2-a0ca08f61655`; the web is healthy on 5180 and the control plane is healthy on 3333.
  - Schemas: core organization migration live, Analytics 29, Connector Hub 8, Geospatial 8, CMMS 14, Workforce 19; Redis and the kernel worker run.
  - Backups are taken before every deploy run (`infra/compose/backups/`).
  - Live proofs pass: the web proof (14 Playwright tests), the places proof (WI-OI-105) and the packs proof (a pack
    activated in Configuration Studio reaches Workforce and Geospatial; one industry pack at a time).

## What is live for the owner (5180)

- **Settings › Organization:** native tenant-defined unit types, units, primary/rollup trees, versioned drafts, validation,
  maker-checker publication/activation, scope grants and Place links. The current local tenant intentionally starts with
  one empty primary tree and no migrated Department data.

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

- WI-OI-118 in Review (Phase 14 Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine). Ready for owner review and commit.
- WI-OI-117 committed `d731c05` in Review (Phase 13 Budgeting, Financial Planning & Commitment Control Engine).
- WI-OI-116 committed `babd0b9` in Review (Phase 12 Inventory Costing, Valuation & Landed Cost Engine).
- WI-OI-115 committed `51c9ad8` in Review (Phase 11 Multi-Company Financial Consolidation & Intercompany Eliminations).
- WI-OI-114 committed `eb7391a` in Review (Phase 10 Fixed Assets Management, Asset Register & Depreciation Engine).
- WI-OI-095 committed `b799abd` in Review (Phase 9 Treasury Operations, Bank Accounts, Statement Ingestion and Automated Bank Reconciliation).
- WI-OI-094 committed `a8207c4` in Review (Phase 8 Financial Operations, Subledgers & General Ledger Integration).
- WI-OI-113 committed `e532d98` and in Review (Commercial & Operational Module Convergence and Outbox-Inbox Handshake).
- WI-OI-093 committed `5d1aa3a` and in Review (Phase 7 Universal Order Management and Customer Fulfillment).
- WI-OI-092 committed `155061d` and in Review (Phase 6 Universal Procurement, Vendor Operations and 3-Way Matching).
- WI-OI-091 committed `2890f10` and in Review (Phase 5 Universal Inventory and Warehouse Operations).

## Open decisions (owner)

- **Owner decision 2026-10-01 (option B) executed locally 2026-10-02:** backup, migrations, exact-image rebuild and consumer-first deployment are complete. Live acceptance proofs remain.

- Replay the 980 place facts dead-lettered during the WI-OI-105 swap (test tenants only), or leave them.
- Removing the unregistered Workforce prototype (packs, payroll and others) is a package-inventory (F7) decision.
- CMMS and Workforce give a member only their exact assigned place; Analytics (and the platform contract) include
  everything inside it. Align them or keep the stricter rule.
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
- Preserve the uncommitted Gemini corrections in `.pi/work/WI-OI-103.md` and
  `scripts/verify-manufacturing-no-developer.mjs`; they are not WI-OI-109 changes.

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
