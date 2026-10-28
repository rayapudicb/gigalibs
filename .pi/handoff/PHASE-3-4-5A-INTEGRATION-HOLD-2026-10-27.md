# Phase 3 + 4 + 5A — integration hold (2026-10-27)

> ## ✅ DEPLOYED TO UAT (2026-10-27 ~13:0x UTC) — tag `7722d85b7cd9-37e91fa8a3b0`
> Owner authorised the session to run the cutover ("run it" → "hand-roll it"). Done via `docker compose`
> (`-p gigalibs-configuration-local`, 6 compose files, 12 env files) from the integration worktree — the live
> project was **adopted** from the `gigalibs-release-speed` worktree to `gigalibs-integration-p345a` (its management
> home is now there). AR excluded (used release-speed's no-AR `compose.modules.local.yaml`, matching live topology).
>
> - **Result: all services Up + healthy at the new tag** (api, web, kernel-worker, module-host, analytics, cmms,
>   connector-hub, geospatial, workforce + redis/uat-postgres). cmms unified from `c88763ff` to the new tag.
> - **Migrations clean:** control-plane 60→69 (9 additive: RBAC delegation, retention, usage, scim, platform-reference,
>   exchange-rates); module schemas **finance 9→15, inventory 4→9, orders 3→4, procurement 3→4** (+ product-catalogue,
>   process-safety, cmms, analytics, connector-hub, geospatial, workforce) — all exit 0, **no schema conflict** with
>   UAT's unreleased writes. Data intact (tenants 366, parties 9).
> - **Hiccup (recovered):** the first `up -d` recreated the postgres container; the one-off migration jobs raced it and
>   failed on `ECONNREFUSED`. Data was safe (external volume `gigalibs-uat-database` reattached); a second `up -d` with
>   postgres already healthy applied everything cleanly. ~1–2 min where app services were down.
> - **Post-deploy, still open:** load the 5 platform-reference sets via the audited operator action (deployed empty by
>   design — `provenance:null`); the `health/relays` check path; and the Security/Accounting review gates were
>   **deployed ahead of sign-off** per the owner's explicit instruction.
> - **Rollback if needed:** redeploy `a1eb8242f379-1e6936b449cd` / cmms `c88763ffb5bb-3d79c392b6f9` (images retained) +
>   restore `infra/compose/backups/gigalibs_backup_20261027_110615Z.dump`.


> ## ⟹ DEPLOYABLE TAG (updated 2026-10-27 PM): `7722d85b7cd9-37e91fa8a3b0`
>
> The release was **rebuilt** to fold in the ICU units commit (`ef44be8b`) + its card sync (`10581cb3`),
> cherry-picked onto the release branch (`730b9172`, `7722d85b`). This **supersedes** the earlier tag
> `2a3ff3ec29b4-6888e499f312` below — deploy `7722d85b7cd9-37e91fa8a3b0`, not `2a3ff3ec`.
>
> - **All 10 images rebuilt and verified** at the new tag: control-plane-migrations, playground-api,
>   workflow-platform, connector-hub-api, analytics-api, cmms-api, ar-api, module-host, workforce-api,
>   geospatial-api. Each: `org.opencontainers.image.revision=7722d85b…`, `com.gigalibs.source-state-sha256=37e91fa8…`,
>   runtime user `65532:65532`.
> - **Env fix during the rebuild:** `.env.modules` (copied from the UAT secrets) was missing the `AR_IMAGE`
>   line that `compose.modules.local.yaml` requires (`${AR_IMAGE:?}`); added
>   `AR_IMAGE=gigalibs/ar-api:7722d85b7cd9-37e91fa8a3b0`. It is a gitignored env file, so the source-state
>   (`37e91fa8a3b0`) and the other 9 images are unchanged.
> - **Deploy command** (owner-run, from the release worktree `/Users/rayapudi/dev/gigalibs-integration-p345a`):
>   use the runbook at the bottom with **`RELEASE=7722d85b7cd9-37e91fa8a3b0`**. Take a fresh backup first
>   (the `…20261027_025305Z.dump` baseline is still valid but goes stale at deploy time).
> - **What it carries:** platform reference data (5 ICU sets, units included), M-CUR real rates, and the whole
>   inventory→finance posting chain's code (via `module-host`); see `PHASE-5-COMPLETION-LEDGER-2026-10-27.md`.
> - Gates still open (unchanged): the three author sign-offs below + Security/Accounting reviews + the owner's
>   decision to put this reconciliation on UAT.

**Status: built and committed on `feat/gigaops-convergence-core`; NOT deployable onto the current UAT as-is.**
Held for an owner-led reconciliation of `main` into the live UAT release line. Do **not** build this batch from the
main tip and deploy it — see the divergence below. This supersedes the deploy guidance in
`PHASE-3-4-RELEASE-CANDIDATE-2026-10-26.md` (that tag `4e0a2f36…` is main-line and has the same divergence).

## Why it is held — the RC lineage and live UAT have split

Live UAT (`gigalibs-configuration-local`, confirmed read-only via `docker ps` 2026-10-27):

| Services | Running tag | Line |
| --- | --- | --- |
| api, web, kernel-worker, module-host, workforce, connector-hub, geospatial, analytics | `a1eb8242f379-1e6936b449cd` | `release/speed-uat` (WI-OI-120ce, project creation on UAT) |
| cmms-api | `c88763ffb5bb-3d79c392b6f9` | `release/speed-uat` HEAD |

Topology:

- **merge-base(`feat/gigaops-convergence-core`, `release/speed-uat`) = `37e55566`** — the 2026-10-08 release both lines descend from.
- Since that base: **main advanced 264 commits** (the shared firehose, including this batch's 18); **release/speed-uat advanced 41 commits** to what is live now.
- Neither `a1eb8242` nor `c88763ff` is an ancestor of main HEAD. The two lines share no history after `37e55566`.

Consequence: a main-tip build deployed onto the current UAT would **both** introduce 264 commits of mixed main work
**and drop the 41 live speed-uat commits**. That is a regression, not a deploy. Cherry-picking this batch onto
`a1eb8242` piecemeal is conflict-heavy and will not build, because speed-uat lacks the main prerequisites this batch
sits on (the Phase 3 RBAC/contracts/schema/migration chain).

## The batch (18 commits, `2506b37a`..`6c8a05e8`)

Contiguous on main; the one commit to exclude inside the range is `a173bf9c` (mobile WI-OI-120cf — deploy group 2, a
different session and release group).

**Phase 3** (plan items 3.4–3.10): `2506b37a` R16 personas · `51d8a9d3` S17 people console · `a630bae0` T9b
retention classes · `f8e0d7ad` T8b usage metering/quotas/billing hand-off · `b91b6fbd` T11b set-up wizard · `a0953457`
R15 directory-group → scoped-role mappings · `2b4a9927` X1 design-token conformance · `21905981` X2 Day-1 benchmark
(+ handoff docs `816910ab`, `a636dec8`).

**Phase 4** (pure-logic engine gaps): `b50e37f6` S13 numbering + R9 column rules + R12 explainable access · `4e0a2f36`
R8 record sharing + X5 search + S13 numbering applied to CMMS.

**Phase 5A**: `a43a5da0`/`97dcc7fe`/`fb786355`/`a7058c3b` WI-OI-120av platform reference data (4 of 5 ICU sets live;
UN/ECE Rec 20 units + ISO 3166-2 / tax jurisdictions still need the official source files) · `3d833bde` M-CUR slice 1
(fabricated `DEFAULT_FX_RATES` removed; conversion refuses a missing rate) · `6c8a05e8` M-CUR slice 2 (workspace
`TenantExchangeRate` store + `currency:read/write` + record/table/list endpoints).

## Image surface (which services carry the batch)

- **control-plane-migrations** — five additive control-plane migrations: `20261026000000_retention_classes`,
  `…010000_usage_counters`, `…020000_scim_group_role_mappings`, `…030000_platform_reference_data`,
  `…040000_tenant_exchange_rates`.
- **playground-api** — T9b, T8b, R15, R16 persona/contracts, + 5A (120av platform-reference service/controller;
  M-CUR tenant-exchange-rate service/controller; currency + platform-reference + currency-permission contracts).
- **workflow-platform (web)** — R16 nav, S17, T11b, X1.
- **cmms-api** — Phase-4 S13 numbering wiring.

(5A added only to the api and migrations images versus the 2026-10-26 Phase-3/4 candidate; web and cmms-api code is
unchanged from it.)

## Review gates still open (independent of the integration)

- **Security:** R16 persona derivation, R15 directory-group grants, S17 people console, and the R13/R14 delegation it
  builds on.
- **Finance / Accounting:** T8b metering/quotas, M-CUR real-rate store. The plan's Accounting reviewer is required
  before any posting flow in 5A+ ships.

## Recommended path for the owner

1. Reconcile `main` into the UAT release line (merge or rebase), resolving against the 41 live `release/speed-uat`
   commits. This is an owner-led integration, not a per-slice cherry-pick.
2. Build the reconciled result from a release worktree per the `release-from-a-release-worktree` procedure (copy the
   ten `infra/compose/.env*` secrets in, `refresh-source-identity.sh`, the five builds), with
   `GIGALIBS_KEEP_IMAGE_VERSIONS=3` so the live `a1eb8242`/`c88763ff` images are not evicted.
3. Clear the Security + Finance/Accounting gates above, then deploy from the release worktree (owner-run).

Until then the batch stays on main, committed and verified (typecheck, audit:layers, permission-catalogue, the new
unit specs — all green), awaiting the integration.

## Reconciliation result (2026-10-27)

Done on request, isolated and **uncommitted** (awaiting owner "commit"):

- **Branch `integration/phase3-4-5a-2026-10-27`** in worktree `/Users/rayapudi/dev/gigalibs-integration-p345a`,
  based at the live speed-uat tip `c88763ff`, with `main` (`6c8a05e8`) merged in — so the result is a proper
  descendant of what is live on UAT. The main worktree and the live release worktrees were not touched.
- **39 merge conflicts resolved**, union principle (keep both lines' work):
  - *Code* (all took main's additive side, speed-uat's side was empty or older): CMMS `requests.service.ts` S13
    numbering, `assignment-scopes` ERP unit-scope, gigaops R5 `peopleScopeClause`, finance `app.module.ts`
    (CostingService), gigaops `module.yaml` (owner's 2026-10-24 Jobs-window note).
  - *Packages* (union): kept `document-lifecycle` (main's, used by finance + inventory) and `process-safety-engines`
    + `process-safety-screening` (speed-uat's pharma); dropped `gigalibs-controls` (both deleted); `pnpm-workspace.yaml`
    lists all three.
  - *Dockerfile*: kept speed-uat's `openssl=3.0.22-1~deb12u1` pin (live and installable; main's older pin may not be).
  - *Generated + lockfile*: taken from main then reconciled — `pnpm install` regenerated the lockfile
    (`--frozen-lockfile` passes); generated catalogs/windows should be regenerated again in the release build.
- **Two auto-merge duplicate artifacts fixed:** `meters.controller.ts` (`get(':meterId')` defined twice — kept the
  copy placed after the static `triggers` routes, per the routing comment) and inventory `inventory.service.ts`
  (`documentSuffix` declared twice).
- **Verification on the integrated tree:** `pnpm install --frozen-lockfile` ✓; contracts + multi-currency build ✓;
  playground-api typecheck ✓; **full-workspace typecheck 106/107** ✓; `audit:layers` ✓.

**One remaining failure, flagged for its author:** `apps/workflow-platform/__tests__/speed-workbench-panels.test.tsx`
(SPEED/pharma) — the test fixtures lack `energeticGroups` (on `SpeedStepMaterialV1`) and `rollup` (on
`SpeedRouteDetailV1`) now required by the merged SPEED contract types. It is a **test** file (production `next build`
excludes tests, so the web bundle is unaffected); correcting the fixtures needs the pharma author.

**Resolutions that want author sign-off before deploy:** the finance `CostingService` dispatcher wiring, the gigaops
R5 scoping, and the SPEED test above (all other sessions' code). Image builds and the deploy are the owner's, from
this worktree, per `release-from-a-release-worktree`.

## Release built (2026-10-27) — session-built, owner deploys

- **Release tag:** `2a3ff3ec29b4-6888e499f312` (revision `2a3ff3ec29b42222b406f076c0027a00e3b7fbac`, source-state
  `6888e499f3129fe2067f…`).
- **Release worktree:** `/Users/rayapudi/dev/gigalibs-integration-p345a`, branch `release/phase3-4-5a-2026-10-27`.
  Its `infra/compose/.env*` are the **UAT** secrets (copied from the speed-uat worktree, `cp -p`, mode 600) with the
  new tags written by `refresh-source-identity.sh`; `CONTROL_POSTGRES_CONTAINER=gigalibs-configuration-local-uat-postgres-1`.
- **Built with `GIGALIBS_KEEP_IMAGE_VERSIONS=5`** so the live `a1eb8242`/`c88763ff` images were not evicted (disk guard: 117 GB free).
- **All 10 images built and verified** at that tag — non-root `65532:65532`, `org.opencontainers.image.revision` and
  `com.gigalibs.source-state-sha256` labels match: control-plane-migrations, playground-api, workflow-platform,
  cmms-api, analytics-api, connector-hub-api, ar-api, workforce-api, geospatial-api, module-host.
- **Pre-deploy backup (read-only):** `infra/compose/backups/gigalibs_uat_predeploy_20261027_025305Z.dump` in the
  release worktree (16.9 MB, sha256 `299804202e01…`), labelled to the running release `a1eb8242` / cmms `c88763ff`.

### Live UAT now (what a deploy replaces)
api/web/kernel-worker/module-host/workforce/connector-hub/geospatial/analytics = `a1eb8242f379-1e6936b449cd`;
cmms-api = `c88763ffb5bb-3d79c392b6f9`; postgres:16-alpine + redis:7-alpine unchanged.

### Owner-run deploy runbook (NOT run by the session)
1. **Clear the gates:** the three author sign-offs above, and the decision to put this 305-commit reconciliation on UAT.
2. **Fresh backup** at deploy time (the baseline above goes stale) — your deploy tool or `backup.sh` from the release worktree.
3. **Migrate:** run `control-plane-migrations:2a3ff3ec29b4-6888e499f312` against the UAT control DB (expand-only).
4. **Recreate services** at the new tag from the release worktree (`--env-file` already carries the tags), partial
   `--no-deps up -d` — driven by your scratchpad `deploy-u1.sh`/`deploy-uat.mjs` pointed at `RELEASE=2a3ff3ec29b4-6888e499f312`.
5. **Read-only verify:** `docker ps` tags, migration ledger, `v1/health/relays`, a smoke of CMMS + the new Phase-3/5A surfaces.
6. **Rollback if needed:** redeploy `a1eb8242…` (cmms `c88763ff…`) and restore the fresh backup.

## Sign-off notes for authors (2026-10-27) — gates toward deploying `2a3ff3ec`

The whole workspace now typechecks **107/107**. Three merge resolutions touched other sessions' code; here is exactly
what each did so the owning author can confirm (no behaviour was invented — in each case the merge kept main's newer
side where speed-uat's side was empty or the older variant).

1. **Pharma SPEED test — FIXED (test-only).** `apps/workflow-platform/__tests__/speed-workbench-panels.test.tsx`
   fixtures were missing fields the merged SPEED contract types now require. Added, all non-exercised by the
   assertions: `librarySetId/libraryVersion/libraryReviewed: null` on the `result()` fixture, `energeticGroups: []` on
   `material()`, `rollup: null` on `route()`. **Pharma author:** confirm these fixtures match intent (they only need
   the gate/balance/equation assertions, which are unchanged). Fix committed on the release branch; it is **test-only
   and does not change the built images** (`next build` excludes tests).
2. **Finance `CostingService` — NEEDS SIGN-OFF.** `modules/financial-operations/apps/api/src/app.module.ts`: the merge
   kept main's version, which adds `CostingService` to the `financeRecordDispatcher` inject + factory and imports
   `createRelayHealthController`. **Finance author:** confirm the dispatcher is meant to receive `costing` (speed-uat's
   version did not pass it).
3. **gigaops R5 scoping — NEEDS SIGN-OFF.** `modules/gigaops/apps/api/src/{availability,resources/workforce-resources}.service.ts`:
   kept main's WI-OI-120ho additions — `peopleScopeClause(...)` limiting working-weeks and the resource picker to the
   caller's units/places (the id path left unscoped). **gigaops author:** confirm this R5 scoping is intended on these
   two reads.

**Deploy artifact remains the `2a3ff3ec29b4-6888e499f312` images** — the pharma commit is test-only; do **not**
re-run `refresh-source-identity.sh` before deploying, or the `.env` will name an unbuilt tag.
