# NOW: where the work stands

Updated 2026-09-29 by Claude (WI-OI-103d d1–d5 committed; review deploy on 5190 done). Keep this file to one page. Replace old content rather than
appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Latest commits:**
  - `6dda714` agriculture proposal;
  - `76af949` WI-OI-085f;
  - `80de9af` handover brief;
  - `9db88a3` WI-OI-085e shared module host.
- **Active work item: WI-OI-103**, the Analytics engine (`.pi/work/WI-OI-103.md`). WI-OI-102 is in Review.
  WI-OI-104 to WI-OI-107 are Proposed.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
- **Running locally** (never touch it during a proof):
  - web on 5180: `a255e935c80e-2e98e70d8d0e`;
  - cmms and workforce: `88967ea35011-9ffa1e2a8005`;
  - the other services: `5abfa667bb10-7507432cb066`;
  - analytics-api: `4cc55442219a-7c0b64d63cfd`, schema 18 (deployed 2026-09-29 with the owner's OK; backup
    `infra/compose/backups/gigalibs_backup_20260929_161251Z.dump`);
  - **review web on 5190**: container `gigalibs-review-web`, image `workflow-platform:4cc55442219a-7c0b64d63cfd`.
  - The 5180 web still has the retired gallery tab, which now answers "not found".
    Remove it with `docker rm -f gigalibs-review-web` when the review ends.

## Owner decisions, 2026-09-29 (handover Task 2)

- **Offline mobile:** SQLite on the device, with changes synced as queued commands that the server validates
  (plan §5.1). Update the vision's CRDT wording in ADR-0014.
- **App-store presence:** decide later, before Release 1.
- **Vision-derived items:** register **catalogue truth** (six maturity states). The others were not chosen.
- **Order:** the **foundation comes first.** The owner approved ADR-0016 F1–F17 on 2026-09-29. Revocation and
  mobile come after.

## Next

**Owner plan (2026-09-29):** foundation work until **Sunday 2026-10-04**, then the **agriculture package** for a
client capability pitch (date not fixed), then back to the rest of the foundation.

1. **WI-OI-103e (`.pi/tasks/WI-OI-103e.md`): e1 and e2 are done; e4 (dashboards) is next.** 103d: d1–d7 are built, verified and deployed for review on 5190 (schema 18).
   Next:
   - the owner creates a Demo Lab workspace and adds a second member with `analytics:models:publish`;
   - the live review: load the sample farm, approve "Yield per hectare", build and save a chart.
   - Then 103e. Continue piece by piece, and commit after each
   piece on the owner's "commit". Charts use ECharts (ADR-0004), not `charts-react`. The card is summarised below:
   chart templates that hold no data.
   - A chart is a query spec plus a visual spec.
   - One renderer covers the 24 types, with a "change chart" menu by data shape and a map.
   - A thin **Explore** screen (pick a measure, group-by and time, then see the chart).
   - The static gallery is retired.
   - The demo uses a clearly labelled sample farm dataset.
2. Then **103e**: dashboards with shared filters, permissions and roles (including `analytics:models:publish`),
   reports owned by Analytics.
3. From Monday: the agriculture package (`.pi/proposals/agriculture-package-plan.md`), with thin first versions
   of connectors, places and the pack.

103a–103b (2026-09-29):
- the query engine (`AnalyticsQueryV1`, `POST v1/query/spec`);
- formula measures with maker-checker and approved-version pinning (migration 000016, schema version 16).

Deployed 2026-09-29: Analytics migrations 16–17 and the analytics image. The 5180 web is still on the old image.

Open decisions:
- drop the empty `gigalibs_platform` schema;
- when to move 5180 to the new web image;
- the `platform-rbac` leftovers.

WI-OI-102 (2026-09-29), 102a–102g:
- ADR-0016;
- engines: Workflow Studio kept, the Python plane parked;
- kernel/capability layers;
- fenced core tables;
- catalogue truth;
- 586 files cleaned up;
- `platform-rbac` merged into "Modules & Plan" and retired.

102b decisions (2026-09-29):
- Workflow Studio is the one workflow engine;
- the Python execution plane is parked;
- the 17 core pipelines are all test data and go when the core workflow tables retire.

Open for later:
- Geospatial `mobile/sync`: adopt or replace (when mobile starts);
- agriculture sources and pack (`.pi/proposals/agriculture-package-plan.md`, phases 4 and 5).

## Watch-outs

- One agent in the repository at a time. Commit only on the owner's literal "commit".
- `pnpm verify` reports the deployment-profile `WORKFORCE_API_URL` drift as KNOWN. Do not fix it without the
  owner.
- 60 active sessions of old UAT test accounts (2026-09-13 to 23) remain. Revoke them only with the owner's OK.
- The GPT agent's Codex account is usage-limited until 2026-10-03.

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
