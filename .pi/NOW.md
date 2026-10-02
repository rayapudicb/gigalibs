# NOW: where the work stands

Updated 2026-10-02 (WI-OI-109 in progress: 109a–109g implemented and verified locally; coordinated deployment, live certification and independent review remain). Keep this file to one page.
Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Active implementation item:** WI-OI-109 (universal organization hierarchy and enterprise scope), owner-approved 2026-10-01. Slices 109a–109g are implemented and verified locally: governed hierarchy, APIs and administration UI; signed organization scope; Department and Place bridges; immutable module replicas; the Workforce → Analytics → Reports organization-aware vertical path; and a server-authored mobile/API manifest. Five configurable reference structures and isolation were proved on throwaway PostgreSQL. Nothing from WI-OI-109 is deployed to the running stack; evidence is in `.pi/work/WI-OI-109.md`. WI-OI-103 and WI-OI-106 remain in Review and their live proofs must be rerun after the coordinated organization-aware release. WI-OI-104, 105 and 107 remain in Review; WI-OI-108 is Proposed.
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

- **Coordinated local release (owner option B):** back up the running database; apply the core organization migration plus Analytics 000026–000029 and Workforce 000017–000018; install distinct relay credentials; rebuild the exact images; deploy consumers before producers; then run live organization administration, Workforce → Analytics → Reports, revocation, tenant/sibling isolation and browser/accessibility proofs.
- Re-run the deferred WI-OI-103 and WI-OI-106 live proofs against the organization-aware stack. Keep WI-OI-109 In Progress until live certification, the known fresh-install blocker and independent reviews are resolved.
- **Deferred Foundation Close:** WI-OI-103/WI-OI-106 organization-aware live proofs, WI-OI-108, the fresh-install fix (item 7), core push intake (item 8), and F3 engine clean-up (item 9).

## Open decisions (owner)

- **Owner decision 2026-10-01 (option B):** one coordinated local release after the organization-aware vertical path. Implementation is ready; backup, migrations, exact-image rebuild, consumer-first deployment and live proofs are pending execution.

- Analytics migration 000026 and WI-OI-103/WI-OI-106 deployment are deliberately deferred until WI-OI-109 organization scope is integrated; do not deploy them meanwhile.

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
