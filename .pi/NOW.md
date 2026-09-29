# NOW: where the work stands

Updated 2026-09-29 by Claude (WI-OI-103a done, uncommitted). Keep this file to one page. Replace old content rather than
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
  - the other services: `5abfa667bb10-7507432cb066`.

## Owner decisions, 2026-09-29 (handover Task 2)

- **Offline mobile:** SQLite on the device, with changes synced as queued commands that the server validates
  (plan §5.1). Update the vision's CRDT wording in ADR-0014.
- **App-store presence:** decide later, before Release 1.
- **Vision-derived items:** register **catalogue truth** (six maturity states). The others were not chosen.
- **Order:** the **foundation comes first.** The owner approved ADR-0016 F1–F17 on 2026-09-29. Revocation and
  mobile come after.

## Next

Write and do the **103b** card: formula measures (for example yield/ha, cost per work order).
- Measures are defined once, as arithmetic over other measures.
- They are versioned, and a second person publishes them (maker-checker).
- Charts pin a measure version.
- Sensitive measures are flagged.

The builder in `query-engine/query-builder.ts` gets a formula aggregate.

103a (2026-09-29):
- the `AnalyticsQueryV1` contract;
- a parameterised builder with no user text in SQL;
- `POST v1/query/spec` with `analytics:read`;
- 64 tests;
- the generated SQL was proven on real PostgreSQL, read-only.

The running analytics service does not have it until it is rebuilt, which is the owner's call (103f).

Open decisions:
- drop the empty `gigalibs_platform` schema;
- rebuild the web and analytics images;
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
