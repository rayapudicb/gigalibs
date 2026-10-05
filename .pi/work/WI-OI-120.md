# WI-OI-120 evidence: UAT readiness programme

Programme from the WI-OI-119 audit; plan in `docs/audits/2026-10-04-production-readiness/remediation-backlog.md`.
Owner decisions of 2026-10-05: fix every module for UAT and hide nothing; UAT on the existing local instance; UAT data
entered by Playwright business flows.

## WI-OI-120a (U1): reproducible build, working UAT instance, every module visible

Card: `.pi/tasks/WI-OI-120a.md`, approved by the owner on 2026-10-05. Part A (repository) below; part B (UAT
instance) waits for the owner's go.

### A1. Lockfile (P0-12)

- With pnpm's cached workspace state removed (`node_modules/.pnpm-workspace-state-v1.json`, which had hidden the
  drift), `pnpm install --frozen-lockfile` failed: `ERR_PNPM_OUTDATED_LOCKFILE … not up to date with
  apps/module-host/package.json`.
- `pnpm install` added the six missing lines (the `@gigalibs/financial-operations-api` link for `apps/module-host`
  and the `@gigalibs/financial-operations-web` link for `apps/workflow-platform`). This is identical to the drift
  recorded by WI-OI-119.
- `pnpm install --frozen-lockfile` then succeeded.

### A2. Finance schema contract (P1-01)

- `modules/financial-operations/db/runtime-manifest.txt` now lists `000007_finance_period_close_accruals_forecasting`.
- `pnpm modules:catalog` regenerated `infra/compose/generated/compose.module-host.yaml` (expected version 6 → 7,
  twice) and `infra/compose/generated/modules.json` (`migrationVersion` 6 → 7). `module-manifests.mjs --check`
  reports no errors (zero drift).
- New rule in `scripts/module-manifests.mjs`: a hosted module's runtime manifest must list every migration file in
  its directory, in order. Shown to fail on the committed list ("missing
  000007_finance_period_close_accruals_forecasting.up.sql") and to pass after the fix.
- Fresh install on an isolated PostgreSQL 16 container (`wi120-migtest`, port 55433) with the real
  `run-module-migrations.mjs`: "Module schema gigalibs_finance is ready at migration 7".

### A3. CMMS and Workforce migration failures (P1-13)

- **Workforce:**
  - Cause: `modules/gigaops/db/runtime-foundation/000020`–`000025` (WI-WFO-001–006) create their objects but are
    the only Workforce migrations without the `schema_migrations` ledger row.
  - On the UAT instance they ran on 2026-10-04 07:06Z, so their tables exist, but the ledger stayed at 19 and the
    runner stopped ("ledger is 19; expected exactly 25").
  - Fix, without editing applied files:
    - new forward migration `000026_wfo_ledger_repair` (records 20–26, `ON CONFLICT (version) DO NOTHING`);
    - version pins moved from 25 to 26 in `infra/compose/compose.workforce.local.yaml` (two places) and
      `modules/gigaops/apps/api/src/runtime-config.ts`.
  - Isolated proof:
    - fresh install reaches 26;
    - with rows 20–26 removed (the UAT state), the runner fails with `relation "wfo_workers" already exists`;
    - after recording rows 20–25 once, it reaches 26. That one-time recording is a part B step on the UAT instance.
- **CMMS:**
  - Cause: committed migration `000017_eam_failure_hierarchy_and_job_plans` (WI-EAM-003) uses the undefined type
    `gigalibs_cmms.user_ref`. CMMS defines `principal_ref`, which 000015 and 000016 use.
  - 000017–000019 also lack the ledger row.
  - Reproduced on the isolated container from exactly the runtime-manifest files: 000015 and 000016 apply, then
    `type "gigalibs_cmms.user_ref" does not exist`.
  - None of 000017–000019 has ever been applied anywhere: 000017 rolls back in its single-statement transaction,
    and the runner stops there.
  - The proposed correction (type `principal_ref`, ledger rows) was tested on scratch copies only: CMMS then
    reaches 19.
  - **Editing the three committed files was refused by the session's permission system ("Modify Shared
    Resources"). Not done; the owner decides.**
- Other module migrations without a ledger row (older first migrations of AR 000006, analytics 000001–2,
  recovery, communications, document-scanner, esignature, geospatial 000001, multi-currency, ontology, saga, tax,
  connector-hub, data-studio, rule-pro, workflow-studio): not changed; recorded for a ledger-rule baseline in a
  later card.

### A4. UAT visibility

- New `apps/workflow-platform/lib/uat-module-status.ts`: setting `GIGALIBS_UAT_PREVIEW`; only the exact value
  `enabled` counts. It also holds the per-module status list: the four ERP workspaces are "sample-figures";
  other PLANNED/CONTAINED modules are "not-verified".
- `lib/module-access.ts`:
  - the readiness lock is lifted when the preview is on;
  - entitlements and permissions still apply;
  - the server reads the setting; client components receive the server's answer;
  - `module.yaml` readiness values are unchanged.
- `components/AppSidebar.tsx`: locked modules are listed with a "UAT" label (padlock when the setting is off).
- New `components/UatPreviewBanner.tsx`, mounted in `app/(app)/layout.tsx`: `role="status"` banner naming the
  module, its readiness and whether its figures are sample data (with the card that replaces them).
- Every API route and the module proxy use the same `canUseTenantModule` decision. All PLANNED/CONTAINED modules
  are already `entitlementEligible`, so the control plane can grant them.
- Deployment: `GIGALIBS_UAT_PREVIEW` added to the web service in `infra/compose/compose.yaml` (default
  `disabled`), to the profile contract's optional keys and to `.env.example`. The profile check reports only the
  known `WORKFORCE_API_URL` drift.
- Tests: `apps/workflow-platform/__tests__/module-access.test.ts` adds 5 UAT preview tests (exact value only;
  lock lifted but entitlement and permission still required; explicit client answer wins; navigation needs a
  tenant; labels). Result: 22 passed, 5 skipped (pre-existing `skipIf` for locked finance modules).
- Known gap: the Plan screen (`components/settings/TenantPlanEntitlements.tsx`, a client component) still shows
  locked modules as not openable. Testers reach them from the menu.

### A5. Finance proofs never write to the UAT database (P1-16)

- New `scripts/lib/isolated-proof-database.mjs`.
  - The seven finance proofs now require an explicit `PROOF_DATABASE_URL`.
  - They refuse any local URL on port 5440 (the UAT instance).
  - Otherwise they exit 78 ("NOT RUN"). The default URL with the dev password is gone.
- `scripts/verify.mjs` reports exit 78 as `NOT RUN` (never PASS), and the result line names the count.
- Checked: no URL → NOT RUN (exit 78); `localhost:5440` and `host.docker.internal:5440` → refused (exit 78).
- With `PROOF_DATABASE_URL` pointing at the isolated container, freshly migrated to finance 7, all seven proofs
  exit 0. (They remain raw-SQL proofs, not HTTP evidence; audit finding P0-11 stands.)

### A6. Images from a clean checkout (P0-12)

- **Method:**
  - `git worktree add --detach` of HEAD `de81f82` in the session scratchpad;
  - the U1 diff applied, plus only the new U1 files; no untracked modules present;
  - `docker build --pull=false --target <t>` with the same arguments as `build-images.sh` and
    `build-*-image.sh`;
  - tags `gigalibs/<image>:u1proof-<state>`, distinct from deployable tags;
  - the UAT instance's `infra/compose/.env` and secrets were not used.
- **First run (state `36cca04ad8de`):**
  - `migrations` OK: the control-plane migrations image, which failed before because of the untracked runner.
  - `module-host` OK.
  - `api`, `web` and `workforce-api` FAILED. Cause: `infra/compose/docker/pnpm-workspace.yaml` (the image
    workspace) never listed `modules/financial-operations/web`, which `apps/workflow-platform` has depended on
    since `a8207c4`.
    - The web build failed with `Cannot find module 'lucide-react'` in `FinancialOperationsWorkspace.tsx`.
    - The Workforce deploy step failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND … @gigalibs/financial-operations-web`.
    - So no web, API or Workforce image could have been built from any commit since Phase 8.
- **Fix:**
  - `modules/financial-operations/web` added to the image workspace.
  - New rule in `scripts/verify-configuration-local-profile.mjs` (`WORKSPACE_DEPENDENCY_MISSING`): every
    `workspace:` dependency of an image-workspace package must be in the image workspace. Shown to report exactly
    this defect before the fix, and only the known `WORKFORCE_API_URL` drift after.
- **Second run (state `66d281389651`, 2026-10-05):** `migrations`, `api`, `web`, `module-host` and
  `workforce-api` all OK, tagged `u1proof-66d281389651`. The tree was HEAD `de81f82` plus exactly the U1 changes, the
  same content as commit `03ebd0c` apart from its evidence text. P0-12 (cannot build from git) is closed for these
  five images; the CMMS, Analytics, Connector Hub and Geospatial images are built by the part B deploy builds.

### Verification

- `pnpm build`: 74/74 tasks successful (log in the session scratchpad).
- `pnpm test`: 292 test files passed (22 skipped); 2,431 tests passed (165 skipped); exit 0.
- Static audits: `audit:production-data` and `audit:all-runtime-data` PASS (after rewording the banner, which first
  tripped the fixture pattern with the phrase "sample data"; the gate was not changed). `audit:package-dependencies`,
  `audit:api-boundary`, `audit:navigation`, `audit:sdlc` and `audit:layers` PASS. `module-manifests.mjs --check`:
  no errors. Deployment profile: known `WORKFORCE_API_URL` drift only.
- `pnpm verify --audits`: `RESULT: PASS for the steps that ran (1 known drift; 7 not run)`. The UAT database was
  unchanged afterwards (newest finance row still 2026-10-04 16:19:09Z).
- Playwright smoke spec `e2e/specs/uat-preview-modules.spec.ts` (36 tests: the menu plus one per module, read-only)
  compiles (`--list`). It runs in part B against the UAT instance.

### Part B (UAT instance): status 2026-10-05 ~04:30Z

The owner gave the go on 2026-10-05. Done:

1. Backup `infra/compose/backups/gigalibs_backup_20261005_042254Z.dump`: 7,008,475 bytes; `shasum -c` OK. Its
   metadata names the running release `local-20261004T065227Z-007e686bebee-c1746f0b541b`, which is also the
   rollback tag.
2. `refresh-source-identity.sh`: env files now name commit `03ebd0c`, tag `03ebd0c366b6-ff554c98771d`, release
   `local-20261005T042338Z-03ebd0c366b6-ff554c98771d`. Secrets preserved.
3. `generate-generated-module-credentials.sh financial-operations` created `.env.module.financial-operations`:
   runtime role `gigalibs_finance_runtime`, key pair; values not printed.
4. `GIGALIBS_UAT_PREVIEW=enabled` appended to `infra/compose/.env`. `docker compose config` with all 10 env files
   and 5 compose files resolves: every service is on the new tag, and the web receives the setting.
5. Read-only check: all 13 tables created by Workforce 000020–000025 exist in `gigalibs_workforce`; the ledger is at 19.
6. Deploy images: the five build scripts are queued after the clean-worktree proof run.

Blocked by the session's permission system (not attempted another way):

- The one-time Workforce ledger record of rows 20–25 (a direct write to the UAT database) was refused ("Remote
  Shell Writes").
- A reduced deploy without Workforce was then refused as well ("Modify Shared Resources"). No container was
  recreated. The running instance is still entirely on `007e686bebee-c1746f0b541b`.
- The CMMS 000017–000019 correction remains refused (part A).

Prepared for the owner: the deploy script in the session scratchpad (`deploy-u1.sh`). It deploys the migrations
jobs and services with consumers first, skips CMMS, and stops at the first failure. Its Workforce job needs rows
20–25 recorded first.
- Deploy images for commit `03ebd0c` (tag `03ebd0c366b6-ff554c98771d`), built 04:29–04:45Z by the repository's five
  build scripts; all OK. Image IDs:
  - control-plane-migrations `1577704e28f0`
  - playground-api `dea8364f94be`
  - workflow-platform `726aa028b6a1`
  - cmms-api `488d84e8ebe1`
  - analytics-api `fa30b8f8fe8b`
  - connector-hub-api `10e372fae43b`
  - workforce-api `f8035c6e1151`
  - geospatial-api `b3ad9979857c`
  - module-host `a0f64c83e797`
- The running instance is still entirely on `007e686bebee-c1746f0b541b` (checked 04:45Z). The ledger record and the
  deploy wait for the owner: either run them, or switch the session out of auto mode so each step can be approved.

### Part B deploy: done for every module except CMMS (2026-10-05 04:55–04:57Z)

- The owner ran the one-time Workforce ledger record and `deploy-u1.sh` in a terminal, because the session's auto
  mode refused them. Full record: `infra/compose/evidence/wi-oi-120a-20261005T045500Z/README.md` (local; that folder
  is git-ignored).
- All migrations jobs exited 0. Ledgers: Workforce 26 (S-03 closed for Workforce), Finance 7, Geospatial 8, Connector
  Hub 8, Analytics 29, Catalogue 1, Inventory 2, Procurement 2, Orders 2.
- Nine services are healthy on `03ebd0c366b6-ff554c98771d`, including Workforce (running again) and the module host
  with Finance (running for the first time).
- `GIGALIBS_UAT_PREVIEW=enabled` is active in the web container.
- An unsigned Connector Hub request carrying only `X-Tenant-Id` is refused (401).
- Open:
  - CMMS (still on `007e686…`, not started, ledger 16; the 000017–000019 correction awaits the owner);
  - the Playwright smoke test (needs a UAT tenant administrator login);
  - U2 findings now visible at runtime, such as the revocation-schema mismatch expected to fail authenticated
    Inventory, Orders, Procurement and Finance routes.

## WI-OI-120b (U1b): design standard

Card `.pi/tasks/WI-OI-120b.md`, approved by the owner on 2026-10-05.

- **Finding:** see the WI-OI-119 post-audit finding. Owner rule `.pi/handoff/HANDOFF-2026-09-29.md:81`.
- **Check:** `scripts/verify-design-tokens.mjs` (`pnpm audit:design-tokens`, also in `pnpm verify`) with a ratchet
  baseline `config/design-token-baseline.json`.
  - First count: 92 files, 5,316 hard-coded colour classes across the web code; not only the Phase screens (for
    example E-Signature 321, Dynamic Forms 188, Ontology 187, Analytics 173, Master Data 171, Platform Control 164).
  - Counts may only fall; new files must be clean; the four U1b files must be zero.
  - It failed for the four files before the restyle and passes after. Total now 4,366 in 88 files.
- **Tailwind:** `apps/workflow-platform/tailwind.config.js` now scans `../../modules/*/web/src` and
  `../../packages/*-react/src`. Before this, classes used only inside module screens and React packages were never
  generated.
- **Restyle:** colour classes only, by a reviewed mapping (scratchpad `u1b_tokens.py`).
  - Dark screens (Catalogue 360, Parties 291): zinc-950/900/800 → `ui-bg-subtle/base/field`;
    `text-white`/`zinc-200`/`zinc-300` → `ui-fg-base`; `zinc-400` → `ui-fg-subtle`; `zinc-500`/`600` →
    `ui-fg-muted`; zinc borders and dividers → `ui-border-base`.
  - Light screens (Application Dictionary 252, form renderer 47): white/zinc-50/100 → `ui-bg-base/subtle/component`;
    zinc text shades → `ui-fg-base/subtle/muted`.
  - Status tints → `ui-tag-{green,red,orange,blue,purple}-{bg,text,border}`; errors → `ui-fg-error`; focus →
    `ui-border-interactive`.
  - Solid action buttons → `ui-button-inverted(-hover)` with `ui-contrast-fg-primary` text; overlays →
    `ui-bg-overlay`.
  - White text on a solid button becomes the button-text token; elsewhere the base text token. So the Catalogue
    title is no longer white on the light page, and the error banner reads as red on a red tint.
- **Not done (scope change):** swapping native elements for `@medusajs/ui` components moves to U5–U7.
- **Tests:** `apps/workflow-platform/__tests__/design-tokens.test.ts` (5 tests: the four files are clean and use
  tokens; the pattern ignores tokens): pass.
- **Verification (2026-10-05):**
  - `pnpm build` 74/74;
  - `pnpm test` 293 files passed (22 skipped), 2,436 tests passed (165 skipped), exit 0;
  - all eight static audits pass, including `audit:design-tokens`; `module-manifests.mjs --check` shows no errors.
- **Deploy:** not yet. After the owner commits, the images are rebuilt and the owner runs the deploy script (auto mode
  refuses deploys from the session).
