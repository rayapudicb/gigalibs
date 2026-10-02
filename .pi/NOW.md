# NOW: where the work stands

Updated 2026-10-02 (WI-OI-109 in progress: 109a–109g are deployed to bounded Local Development; live certification, fresh-install proof and independent review remain). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Active implementation item:** None currently active. WI-WFO-001–006 are in Review (.pi/work/WI-WFO-006.md); WI-OI-109 is in Review. WI-OI-103 and WI-OI-106 remain in Review; WI-OI-104, 105, 107 remain in Review; WI-OI-108 is Proposed. Next proposed: WI-WFO-007 (Mobile Worker App) or live container certification.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
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

- Complete live organization administration, Workforce → Analytics → Reports, relay/revocation, tenant/sibling isolation and browser/accessibility certification on the deployed organization-aware stack.
- Re-run the deferred WI-OI-103 and WI-OI-106 live proofs. Keep WI-OI-109 In Progress until live certification, the known fresh-install blocker and independent reviews are resolved.
- **Deferred Foundation Close:** WI-OI-103/WI-OI-106 organization-aware live proofs, WI-OI-108, the fresh-install fix (item 7), core push intake (item 8), and F3 engine clean-up (item 9).

## Open decisions (owner)

- **Owner decision 2026-10-01 (option B) executed locally 2026-10-02:** backup, migrations, exact-image rebuild and consumer-first deployment are complete. Live acceptance proofs remain.

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
- Preserve the uncommitted Gemini corrections in `.pi/work/WI-OI-103.md` and
  `scripts/verify-manufacturing-no-developer.mjs`; they are not WI-OI-109 changes.

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
