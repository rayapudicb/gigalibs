# NOW: where the work stands

Updated 2026-10-05 (`5ceba59` — U1b, U2, U3.1 — deployed to the UAT instance at 09:08Z). Keep this file
to one page. Replace old content rather than appending to it, and update it at the end of every task.

## State

- **Release verdict: NO-GO.** The audit (`docs/audits/2026-10-04-production-readiness/README.md`) found 13 P0 and 29
  P1, verified against code, git and the running system. No work item has reached G5, G6 or G7.
- **WI-OI-119 follow-up (2026-10-05):** metadata proposals/current-build investigation delivered in
  `docs/audits/2026-10-04-production-readiness/metadata-proposals-investigation-2026-10-05.md`; review only,
  no product changes or gate upgrades. Distinguishes recorded deployment from local U2 work.
- **Goal now (owner, 2026-10-05):** every module, Phases 1–14 and the enhancements included, fixed and visible for
  UAT on the existing local instance. Nothing is hidden or removed. UAT data is entered by Playwright business flows.
- **WI-OI-120d (U3.1 SCIM): Review, committed `5ceba59`** after the primary session's review (owner "commit",
  2026-10-05). SCIM tests 21 passed/6 skipped; full `pnpm test` 2,467 passed/171 skipped. Deployed 09:08Z.
  P0-06 stays open until the independent Security review (D7). Residual P2: a custom role holding
  `users:create`/`users:update` can assign TENANT_ADMIN. Evidence: `.pi/work/WI-OI-120.md` U3.1.
- **WI-OI-120e (U3.2): Review, committed `828b75a`, deployed 11:57Z.** Owner approved 2026-10-05. Login lockout (P1-20), Rule Studio
  tenant boundary (P0-04), Connector Hub webhook by endpoint ID with mandatory signature (P0-08), per-person punch
  queue (P1-25), renderer deny-by-default (P1-24). `pnpm build`, `pnpm test` (2,495 passed) and `pnpm verify` pass
  (known drift; 8 proofs NOT RUN). Adds control migration `20261005000000_login_throttle` and Connector Hub
  migration 9. Evidence: `.pi/work/WI-OI-120.md` U3.2. Owner question open: add the Governor fix (P1-11, deployed in
  the control plane) to U3.2?
- **WI-OI-120f (F0, metadata-governed windows):** approved 2026-10-05. F0.1–F0.4 committed (F0.1, F0.2 deployed).
  F0.5 Inventory on metadata windows committed `bf049e1` and deployed (`bf049e1f50ca-9e71babfe73c`); the six windows
  were activated for GigaLibs Global Enterprise at start-up. The owner's check found every window saying "declares no
  view": the renderer read the endpoint's wrapper instead of its `manifest`. Fixed and checked (build, 2,542 tests,
  verify); deployed 17:31Z as `2104f91` (21 services healthy); the owner's on-screen check of /inventory is pending.
  The Playwright flow `e2e/specs/inventory-business-flow.spec.ts` needs E2E_UAT_ADMIN_EMAIL/PASSWORD to run.
- **CMMS migrations 000017–000019 corrected and deployed 13:03Z** (owner-approved; patch applied by the owner): `principal_ref`, permissive
  tenant policies (RESTRICTIVE-only denied every row), one transaction, ledger rows. Proven on a throwaway UAT copy.
- **ERP access by role:** the five ERP modules were enabled for GigaLibs Global Enterprise at 12:31Z (owner ran
  `enable-erp-modules.sh`). Tenant admins now hold the five ERP modules' permissions and `parties:*` (code change,
  deployed 13:05Z).
- **One writer:** the owner chose this session (option 1, 2026-10-05); the peer session was told.
- **U1 remaining recovery/deployment work:**
  - **Part A is committed (`03ebd0c`).** Evidence: `.pi/work/WI-OI-120.md`.
    - Lockfile fixed: the frozen install passes.
    - Finance migration 7 in its runtime list; compose regenerated; new check for this class of defect.
    - Workforce ledger repair migration 000026.
    - UAT visibility setting `GIGALIBS_UAT_PREVIEW` (its menu labels and banner were later removed, owner request).
    - Finance proofs refuse the UAT database; `verify` shows them as NOT RUN.
    - `pnpm build`, `pnpm test` (2,431 passed) and the static audits pass.
  - **Open:**
    - the CMMS migrations 000017–000019 fix, which edits never-applied committed files; the permission system
      refused it, so the owner decides;
    - part B: deployed on 2026-10-05 (see below). Still open: the CMMS correction and the Playwright smoke test
      (needs a UAT tenant administrator login).

- **WI-OI-120b (U1b, design standard)** approved 2026-10-05; deployed 09:08Z.
  - Done: the design-token check (ratchet; 5,316 → 4,366 hard-coded colours) and Tailwind now scanning module packages.
  - Restyled to tokens: Catalogue, Parties, Application Dictionary and the form renderer.
  - Medusa component swaps move to U5–U7.
- **WI-OI-120c (U2):** committed as `220508e`, deployed 09:08Z (ledgers 3/3/3/8 on the UAT instance). Proven by the
  isolated HTTP proof; not yet exercised on the UAT instance (entitlements). Full request-level idempotency deferred.
- **Module status board for testers:** `docs/audits/2026-10-04-production-readiness/uat-module-status.md` (what works,
  what does not, what is not deployed, and the plan to UAT and to production).

## What is running locally (UAT instance, deployed 2026-10-05 13:05Z)

- Release `996abae3f65a-cf90c743456c` (commit `996abae`): U1b, U2, U3.1, U3.2, F0.1, F0.2, the CMMS correction and
  tenant-admin ERP access. Record: `infra/compose/evidence/wi-oi-120-20261005T130319Z/` (local).
  - Healthy: web, control-plane API, kernel worker, Analytics, Geospatial, Connector Hub (9), Workforce (26), CMMS (19,
    running again) and the module host with Catalogue (1), Inventory (3), Orders (3), Procurement (3) and Finance (8).
  - Rollback: release `828b75af9a28-af904a40a84c` plus backup `gigalibs_backup_20261005_130000Z`.
- Catalogue, Inventory, Procurement, Orders and Finance are enabled for GigaLibs Global Enterprise, and its tenant
  admins hold their permissions. Inventory, Procurement, Orders and Finance still show their old hand-written screens
  until their metadata windows land (F0.5, then U7–U18).
- AR, Spend, Tax, Multi-Currency and the other 9 modules off the module SDK do not run here (U29).
- Unattributed proof data from earlier proof runs (including the audit's own run) is still in the database (D5).

## Next

1. Owner: grant Catalogue, Inventory, Procurement, Orders and Finance to the UAT tenant in Platform Control Tower;
   then a signed-in check of each module's API on this instance.
2. F0 (WI-OI-120f): F0.1–F0.5 and the manifest fix deployed; owner checks /inventory on screen.
   U19a (WI-OI-120h, approved): CMMS screens reach their API. 36 routes added; the gateway forwards PUT and DELETE on
   listed routes; space lists answer `{ items }`; five API commands that failed with 500 and parts issue/return fixed.
   Proof 56/56; committed `b872b9c`, deployed 18:36Z; owner's on-screen CMMS check pending.
   U7 Catalogue (WI-OI-120g): eight metadata windows, maker-checker actions, price resolver, import/export; Orders,
   Procurement and Finance mock-ups replaced by honest notices. Committed `830a5a1`, deployed. A second price/entry per
   version failed (outbox version collision): fixed, proof 27/27, committed with the walk-through tooling.
   UAT walk-through: `uat.admin@gigalibs.io` (Tenant Admin, GigaLibs Global Enterprise); starter data entered on the
   screens; board of 105 screens: 57 load, 8 not built, 35 broken, 5 crash (causes and batches in the work log).
   Fix deployed (`bed4aa1`, 01:30Z); starter data complete (four prices).
   F0.6 "Add new" from pickers (WI-OI-120j): implemented, checks pass; committed; next build, deploy and the UAT
   Add-new step. Then the quick-fixes batch; U20a; permissions batch; U29.
   Workforce `wfo` screens: diagnosed (ungated routes, see work log); U20a card to propose. P0-05, P0-07, P0-10, P1-10 and the P1-11 prototypes are in modules not running here; they are fixed
   as each module moves onto the module SDK (U29). Independent Security review before any defect closes.
3. Then U4–U6 (Dictionary & Master Data hardening), U7–U18 (module by module Playwright flows). Plan:
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
