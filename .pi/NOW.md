# NOW: where the work stands

Updated 2026-10-05 (WI-OI-120a U1: part A committed `03ebd0c`; part B deployed 04:57Z for every module except CMMS). Keep this file
to one page. Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Release verdict: NO-GO.** The audit (`docs/audits/2026-10-04-production-readiness/README.md`) found 13 P0 and 29
  P1, verified against code, git and the running system. No work item has reached G5, G6 or G7.
- **Goal now (owner, 2026-10-05):** every module, Phases 1–14 and the enhancements included, fixed and visible for
  UAT on the existing local instance. Nothing is hidden or removed. UAT data is entered by Playwright business flows.
- **Active implementation item:** WI-OI-120a (U1), approved 2026-10-05.
  - **Part A is committed (`03ebd0c`).** Evidence: `.pi/work/WI-OI-120.md`.
    - Lockfile fixed: the frozen install passes.
    - Finance migration 7 in its runtime list; compose regenerated; new check for this class of defect.
    - Workforce ledger repair migration 000026.
    - UAT visibility setting `GIGALIBS_UAT_PREVIEW`, with menu labels and a banner.
    - Finance proofs refuse the UAT database; `verify` shows them as NOT RUN.
    - `pnpm build`, `pnpm test` (2,431 passed) and the static audits pass.
  - **Open:**
    - the CMMS migrations 000017–000019 fix, which edits never-applied committed files; the permission system
      refused it, so the owner decides;
    - part B: deployed on 2026-10-05 (see below). Still open: the CMMS correction and the Playwright smoke test
      (needs a UAT tenant administrator login).

- **WI-OI-120b (U1b, design standard)** approved 2026-10-05, in progress.
  - Done: the design-token check (ratchet; 5,316 → 4,366 hard-coded colours) and Tailwind now scanning module packages.
  - Restyled to tokens: Catalogue, Parties, Application Dictionary and the form renderer.
  - Medusa component swaps move to U5–U7.
  - Not deployed yet; it goes out with the next deploy.
- **Owner, 2026-10-05:** remove the UAT labels (done in WI-OI-120b, uncommitted). Goal: every module
  production-ready in one build, then move to the cloud. iDempiere map: `docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md`
  (GPL v2 reference only; legal decision D8). Next card proposed: WI-OI-120c (U2, ERP APIs accept real data).
- **Module status board for testers:** `docs/audits/2026-10-04-production-readiness/uat-module-status.md` (what works,
  what does not, what is not deployed, and the plan to UAT and to production).

## What is running locally (UAT instance, deployed 2026-10-05 04:57Z)

- Release `03ebd0c366b6-ff554c98771d` (commit `03ebd0c`). The owner ran the deploy; record in
  `infra/compose/evidence/wi-oi-120a-20261005T045500Z/` (local).
  - Healthy: web, control-plane API, kernel worker, Analytics, Geospatial, Connector Hub, Workforce (running again,
    migration 26) and the module host with Catalogue, Inventory, Orders, Procurement and Finance (Finance for the
    first time, migration 7).
  - `GIGALIBS_UAT_PREVIEW=enabled`: every module is listed with its UAT label.
  - Rollback: release `007e686bebee-c1746f0b541b` plus backup `gigalibs_backup_20261005_042254Z`.
- **CMMS is still down** (old image, ledger 16). Migrations 000017–000019 need the correction the session was not
  permitted to make.
- Known at runtime and expected: the revocation-schema mismatch (audit P1-02) should make authenticated Inventory,
  Orders, Procurement and Finance calls fail until U2. Screens show their UAT labels meanwhile.
- Unattributed proof data from earlier proof runs (including the audit's own run) is still in the database (D5).

## Next

1. Owner: decide the CMMS 000017–000019 correction; say "commit" for part A; give the go for part B (U1).
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
- `pnpm verify` is safe again: the Finance proofs run only with `PROOF_DATABASE_URL` (an isolated database) and
  otherwise report NOT RUN.
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
