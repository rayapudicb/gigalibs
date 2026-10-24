# WI-OI-120hm (M-WF1 completion): un-hold the Jobs & positions window

- **Status:** Done (owner decision, 2026-10-24): investigation only — `/gigaops/jobs` stays a workbench component; the metadata-window build is deferred to a future L card. No product code changed.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.1, M-WF1 completion). Parent card WI-OI-120u. Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Finish M-WF1 by bringing the Jobs & positions metadata window into the generated set, so `/gigaops/jobs`
leaves the Workforce workbench and becomes a metadata window — matching People, Availability and Bookings.
The owner held this window back on 2026-10-13 (ADR-0033 D1) until it could do what the workbench screen does.
Plan v3 step 2.1 calls for finishing it. Its own comment names the three gaps: **job-profile revisions**,
**people placed in positions**, and a **site/department picker**.

## Finding and decision (2026-10-24)

Investigation against the parity target ([`JobsAndPositions.tsx`](../../apps/workflow-platform/components/gigaops/JobsAndPositions.tsx),
WI-OI-065) showed the three gaps are not an M-sized window edit:

- **Site/department picker** — trivial and ready: the `wf.positions` adapter already treats `site-ref` and
  `organization-unit-id` as writable (`workforce-record-adapters.ts:300-301`); both are existing platform lookups.
- **Revisions** — the workbench models each job profile as an *effective-dated revision chain* (title, category,
  description, required-capabilities), viewed as-of a date, with "change from a date" minting a new revision. There
  is **no revisions record adapter**, and `requiredCapabilities` is a multi-select array the metadata field model
  does not support.
- **People in positions** — a full *engagement lifecycle* (engage / end / cancel / withdraw, single incumbent,
  date-conditional actions). There is **no engagements record adapter**; the only `engagements` service in the tree
  is the retired WFO stack (WI-WFO-001/002, Replaced, failing migrations) and must not be built on.

Reaching true parity needs two new record adapters plus metadata-framework features (multi-select, as-of views,
date-conditional actions) — L-sized and overlapping M-WF3, not this card's M.

**Owner decision (2026-10-24):** keep `/gigaops/jobs` on the Workforce workbench as an accepted component — the
same treatment `module.yaml` already gives clock-in and dispatch. The metadata-window build is **deferred**; if it
is ever wanted, a properly-scoped L card covers the adapters and framework features. `jobs-window.held.mjs` is
retained as the starting point for that future card.

## Scope

- **May change:** `modules/gigaops/dictionary/` (`windows.mjs` to generate the window; `jobs-window.held.mjs`;
  reference/lookup wiring for site and department), `modules/gigaops/module.yaml` (`ui.pages` — add `/gigaops/jobs`
  as a metadata page and drop the workbench route note at lines 36–39), and a gigaops record adapter/resolver
  only if the people-in-positions view needs one.
- **Must not change:** the CMMS import/export files; another agent's work; secrets; the UAT database; the web on
  port 5180.

## Read first

- `modules/gigaops/dictionary/jobs-window.held.mjs` — the held window and its comment naming the three gaps.
- `modules/gigaops/dictionary/windows.mjs` — the builder and where generated windows are assembled.
- `modules/gigaops/module.yaml` — `ui.pages` and the hold comment (lines 36–39); routes `v1/job-profiles/{id}/revisions`,
  `v1/positions`, `v1/engagements` (whether people-in-positions data is already exposed).
- The `wf.job-profiles` / `wf.positions` record adapters (already registered and tested) + any engagements adapter.
- `packages/contracts/src/configuration/platform-lookups.ts` — `workspace-sites` and `organization-units` are
  platform lookups already (so the pickers need no new resolver).

## Steps

1. **Site/department picker:** change position `site-ref` and `organization-unit-id` (currently plain `TEXT`,
   lines 46–47 of the held file) to `REFERENCE` fields using the `workspace-sites` and `organization-units`
   platform lookups.
2. **Job-profile revisions:** add the revise action/flow that calls `POST v1/job-profiles/{id}/revisions`
   (effective-dated), visible to `workforce.jobs.manage`.
3. **People in positions:** add a separate window (its own child tabs — a window has one level) that lists
   engagements per position (who currently fills each position). Add a resolver/adapter only if that data is not
   already exposed; if it needs new API work, stop and ask (that is M-WF3/engagements scope, not M-WF1).
4. **Un-hold:** generate `wf-jobs` from `windows.mjs`, register `/gigaops/jobs` as a metadata page in `module.yaml`,
   and remove the workbench Jobs route.
5. **Tests:** window compiles to a stable checksum; conversion audit passes; the site/department lookups resolve;
   any new resolver is unit-tested.
6. `pnpm verify` clean (no new failures).

## Resolved (2026-10-24)

- [x] Investigated the three gaps against the workbench parity target; scope is L, not M (see Finding).
- [x] Owner decided: `/gigaops/jobs` stays a workbench component; metadata-window build deferred.
- [x] Steps 1–6 above are **not executed** (no product code changed). The held file is retained.
- [x] `module.yaml` and `windows.mjs` hold comments updated to record the decision; `.pi/NOW.md` updated.

The original Goal/Scope/Steps above are kept as the brief for a future L card if the window is ever built.
