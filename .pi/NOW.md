# NOW: where the work stands

Updated 2026-10-05 (WI-OI-119 audit delivered, in Review; owner chose UAT readiness for every module; U1 = WI-OI-120a proposed). Keep this file
to one page. Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Release verdict: NO-GO.** The audit (`docs/audits/2026-10-04-production-readiness/README.md`) found 13 P0 and 29
  P1, verified against code, git and the running system. No work item has reached G5, G6 or G7.
- **Goal now (owner, 2026-10-05):** every module, Phases 1–14 and the enhancements included, fixed and visible for
  UAT on the existing local instance. Nothing is hidden or removed. UAT data is entered by Playwright business flows.
- **Active implementation item:** none. **Next card:** WI-OI-120a (U1: reproducible build, working UAT instance,
  every module visible), Proposed in `.pi/tasks/WI-OI-120a.md` and waiting for the owner's OK.
- **Committed code (HEAD) cannot be built, installed or started.** The image build and migration runner use
  untracked files, the lockfile is stale since `a8207c4`, and the module host rejects Finance's schema version (7 vs 6).
- **Phases 1–14 (WI-OI-109–118, 091–095):** Review, gate at most local G4. The "G0–G6 Proved" claims for 110 and 111
  are withdrawn. Gates and statuses were corrected (downgrade only) in `.pi/WORK_ITEMS.md`.
- **Wave 0:** WI-OI-080–083 and 085 in Review; WI-OI-084 (mobile) not started.

## What is running locally (checked 2026-10-04 16:00Z, read-only)

- All app containers run `007e686bebee-c1746f0b541b`, created 2026-10-04 07:06Z by a deploy that nobody recorded
  (backup `gigalibs_backup_20261004_061720Z` exists). This image has Phases 2–7. It does not have WI-OI-113 or Phases
  8–14, and no Finance service runs.
- **CMMS and Workforce are down** since that deploy. Their migration jobs exit 1: CMMS fails with
  `type "gigalibs_cmms.user_ref" does not exist`; Workforce with "ledger is 19; expected exactly 25".
- Two untracked migrations (`20260923590000_*`, `20261002000000_*`) were applied to the local database on
  2026-10-04 06:41Z. Finance migrations 1–7 were applied before their commits.
- Proof scripts left unattributed test data (83 test tenant IDs in Finance) and a login role `rls_test_user`.
  `pnpm verify`, including `--audits`, writes to this database. The audit's own run did too (2026-10-04 16:19Z;
  9 books, 26 journals).

## Next

1. Owner approves or amends WI-OI-120a (U1). Its part B (backup, migrations, deploy on the UAT instance) needs the
   owner's go at that moment.
2. Then U2 (ERP modules answer requests), U3 (security), then one card per module with a Playwright business flow
   (U4–U21), journeys (U22–U23), never-built spec items (U24–U27) and UAT (U28). Plan:
   `docs/audits/2026-10-04-production-readiness/remediation-backlog.md`.

## Open decisions (owner)

- Settled 2026-10-05: all phases in UAT scope (D1); AR in scope (D2); mobile and other never-built spec items wanted
  (D3, Stage 4); runner and migrations committed (D4); UAT on the existing instance.
- **D5 Local database clean-up:** remove the proof data and `rls_test_user`.
- **D6 Credentials:** rotate the live third-party credentials in untracked `.env` files under
  `modules/communications-textfly/`.
- **D7 Named humans:** independent Security, QA, Product, Accounting and Legal reviewers and a release authority.
- Still open from before: replay the 980 dead-lettered place facts; remove the unregistered Workforce prototype (F7);
  align place-scope rules between CMMS/Workforce and Analytics; drop the empty `gigalibs_platform` schema and the
  `platform-rbac` leftovers; Analyst `analytics:export`; revoke 721 old test sessions; confirm ADR-0017.

## Watch-outs

- One agent in the repository at a time. Commit only on the owner's literal "commit".
- Do not run `pnpm verify` until R2 isolates the Finance proof steps; run the static audits one at a time instead.
- `pnpm verify` reports the deployment-profile `WORKFORCE_API_URL` drift as KNOWN. Do not fix it without the owner.
- Deploy consumers before producers (Analytics, then Geospatial, then Connector Hub).
- Other agents' work lands here. Review it before deploying it, and record every deploy (the 2026-10-04 one was not).
- `pnpm-workspace.yaml` globs pull the untracked `modules/communications-textfly` and `modules/platform-rbac` into
  local builds.

## Where things are

- **Rules:** `AGENTS.md`. Owner rules and architecture: `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md` (canonical). Evidence: `.pi/work/WI-OI-*.md`; this audit: `.pi/work/WI-OI-119.md`.
- **Audit:** `docs/audits/2026-10-04-production-readiness/` (report, backlog, four appendices).
- **Task cards:** `.pi/tasks/` (template `.pi/tasks/TEMPLATE.md`).
